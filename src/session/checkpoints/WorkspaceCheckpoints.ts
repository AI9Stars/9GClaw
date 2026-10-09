import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import type { CanonicalMessage } from "../../model/index.js";
import { getPilotProjectChatDir } from "../../pilot/paths.js";
import { buildStructuredPatch } from "../../tool/builtin/filesystem/structuredPatch.js";

import type { FileVersion, FileChange, Checkpoint, CheckpointSummary, RestorePlan, RestoreOperation, CheckpointRequest } from "./types.js";
export type { FileVersion, FileChange, Checkpoint, CheckpointSummary, RestorePlan, RestoreOperation, CheckpointRequest } from "./types.js";

const EXCLUDED = new Set([".git", ".pilotdeck", "node_modules", ".venv", "venv", "dist", "build", "coverage", ".next", ".cache", "__pycache__"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_WORKSPACE_BYTES = 256 * 1024 * 1024;
const ABSENT: FileVersion = { kind: "absent" };
const stores = new Map<string, Promise<CheckpointStore>>();
const leases: Array<{ workspace: string; done: Promise<void> }> = [];
const overlaps = (left: string, right: string) => left === right || inside(left, right) || inside(right, left);

export class CheckpointError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export async function getCheckpointStore(workspace: string, pilotHome: string): Promise<CheckpointStore> {
  const root = await fs.realpath(workspace);
  const key = `${path.resolve(pilotHome)}\0${root}`;
  let pending = stores.get(key);
  if (!pending) {
    const workspaceId = digest(Buffer.from(root)).slice(0, 24);
    pending = (async () => {
      // Keep backup storage outside project registration directories, including aliased roots.
      const directory = path.join(path.resolve(pilotHome), "checkpoints", workspaceId);
      const legacy = path.resolve(getPilotProjectChatDir(root, pilotHome), "..", "checkpoints", workspaceId);
      await fs.mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
      if ((await fs.stat(legacy).catch(() => undefined))?.isDirectory() && !await fs.stat(directory).catch(() => undefined)) {
        await fs.rename(legacy, directory).catch(async error => { if (!(await fs.stat(directory).catch(() => undefined))?.isDirectory()) throw error; });
      }
      return new CheckpointStore(root, directory);
    })();
    stores.set(key, pending);
    void pending.catch(() => { if (stores.get(key) === pending) stores.delete(key); });
  }
  return pending;
}

/** Immutable objects and manifests. A lease spans a turn or restore, not a session. */
export class CheckpointStore {
  constructor(public readonly workspace: string, public readonly directory: string) { this.workspace = canonicalPath(workspace); }

  get busy(): boolean { return leases.some(lease => overlaps(lease.workspace, this.workspace)); }
  async acquire(): Promise<() => void> {
    const previous = leases.filter(lease => overlaps(lease.workspace, this.workspace));
    let release!: () => void;
    const lease = { workspace: this.workspace, done: new Promise<void>(resolve => { release = resolve; }) };
    leases.push(lease);
    await Promise.all(previous.map(item => item.done));
    let released = false;
    return () => { if (!released) { released = true; leases.splice(leases.indexOf(lease), 1); release(); } };
  }
  private recordPath(kind: "manifests" | "plans" | "operations" | "edits", id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new CheckpointError("INVALID_ID", "Invalid checkpoint identifier.");
    return path.join(this.directory, kind, `${id}.json`);
  }
  private objectPath(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new CheckpointError("INVALID_OBJECT", "Invalid content object.");
    return path.join(this.directory, "objects", hash);
  }
  async putObject(content: Buffer): Promise<string> {
    const hash = digest(content), destination = this.objectPath(hash);
    try { await this.readObject(hash); return hash; }
    catch (error) { if (!hasCode(error, "ENOENT")) throw error; }
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    try { await this.atomicWrite(destination, content, false); }
    catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
    return hash;
  }
  async readObject(hash: string): Promise<Buffer> {
    const content = await fs.readFile(this.objectPath(hash));
    if (digest(content) !== hash) throw new CheckpointError("CORRUPT_BACKUP", "Checkpoint content is missing or corrupt.");
    return content;
  }
  private async writeRecord(kind: "manifests" | "plans" | "operations" | "edits", value: { id: string }, update = false): Promise<void> {
    const destination = this.recordPath(kind, value.id);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await this.atomicWrite(destination, Buffer.from(JSON.stringify(value)), update);
  }
  private async atomicWrite(destination: string, content: Buffer, update: boolean): Promise<void> {
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, "wx", 0o600);
      try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
      if (update) await fs.rename(temporary, destination); else await fs.link(temporary, destination);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  async readCheckpoint(id: string, sessionId: string): Promise<Checkpoint> {
    const checkpoint = JSON.parse(await fs.readFile(this.recordPath("manifests", id), "utf8")) as Checkpoint;
    if (checkpoint.version !== 1 || checkpoint.workspace !== this.workspace || checkpoint.sessionId !== sessionId) {
      throw new CheckpointError("CHECKPOINT_MISMATCH", "Checkpoint does not belong to this conversation and directory.");
    }
    return checkpoint;
  }
  async resolveFile(relative: string): Promise<string> {
    if (!relative || relative.includes("\0") || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) {
      throw new CheckpointError("INVALID_PATH", "Invalid checkpoint file path.");
    }
    const target = path.resolve(this.workspace, relative);
    if (!inside(this.workspace, target) || relative.split(/[\\/]/).includes(".git")) throw new CheckpointError("INVALID_PATH", "Path is outside the protected directory.");
    let parent = path.dirname(target);
    while (parent !== this.workspace) {
      try {
        const info = await fs.lstat(parent);
        if (info.isSymbolicLink() || !info.isDirectory()) throw new CheckpointError("UNSAFE_PATH", "A parent directory was replaced or is a symbolic link.");
      } catch (error) { if (!hasCode(error, "ENOENT")) throw error; }
      parent = path.dirname(parent);
    }
    const actualRoot = await fs.realpath(this.workspace);
    if (actualRoot !== this.workspace) throw new CheckpointError("UNSAFE_PATH", "The workspace directory has moved.");
    return target;
  }
  async captureFile(relative: string, save = true): Promise<FileVersion> {
    const target = await this.resolveFile(relative);
    for (let attempt = 0; attempt < 3; attempt++) {
      let before;
      try { before = await fs.lstat(target); }
      catch (error) { if (hasCode(error, "ENOENT")) return ABSENT; throw error; }
      if (!before.isFile() || before.isSymbolicLink()) return { kind: "unprotected", reason: "Symbolic links and non-regular files are not restored automatically." };
      if (before.size > MAX_FILE_BYTES) return { kind: "unprotected", reason: "File exceeds the 10 MB checkpoint limit." };
      let content: Buffer;
      try {
        const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.ino !== before.ino) continue;
          content = await handle.readFile();
        } finally { await handle.close(); }
      } catch (error) {
        if (hasCode(error, "ENOENT")) continue;
        if (hasCode(error, "ELOOP")) return { kind: "unprotected", reason: "File was replaced with a symbolic link." };
        throw error;
      }
      let after;
      try { after = await fs.lstat(target); } catch (error) { if (hasCode(error, "ENOENT")) continue; throw error; }
      if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) continue;
      const hash = save ? await this.putObject(content) : digest(content);
      return { kind: "file", hash, size: content.length, mode: before.mode & 0o777, binary: content.includes(0) };
    }
    return { kind: "unprotected", reason: "File changed while its checkpoint was being captured." };
  }
  async capture(sessionId: string, turnId: string, phase: Checkpoint["phase"], context?: CanonicalMessage[]): Promise<Checkpoint> {
    const files: Record<string, FileVersion> = {};
    let bytes = 0;
    const walk = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const target = path.join(directory, entry.name), relative = path.relative(this.workspace, target).split(path.sep).join("/");
        if (entry.isDirectory()) {
          if (!EXCLUDED.has(entry.name)) {
            try { await this.resolveFile(`${relative}/.checkpoint-boundary`); await walk(target); }
            catch { files[relative] = { kind: "unprotected", reason: "Directory changed or could not be read during capture." }; }
          }
          continue;
        }
        if (entry.name.startsWith(".pilotdeck-restore-")) continue;
        if (bytes >= MAX_WORKSPACE_BYTES) { files[relative] = { kind: "unprotected", reason: "Workspace exceeds the 256 MB checkpoint budget." }; continue; }
        try { files[relative] = await this.captureFile(relative); }
        catch (error) { files[relative] = { kind: "unprotected", reason: error instanceof Error ? error.message : "Cannot capture file." }; }
        if (files[relative].kind === "file") bytes += (files[relative] as Extract<FileVersion, { kind: "file" }>).size;
      }
    };
    await walk(this.workspace);
    return { version: 1, id: randomUUID(), sessionId, turnId, workspace: this.workspace, createdAt: new Date().toISOString(), phase, status: "complete", files,
      ...(context ? { contextHash: await this.putObject(Buffer.from(JSON.stringify(context))) } : {}) };
  }
  async save(checkpoint: Checkpoint): Promise<void> { await this.writeRecord("manifests", checkpoint); }
  async list(sessionId: string): Promise<Checkpoint[]> {
    const directory = path.join(this.directory, "manifests");
    const names = await fs.readdir(directory).catch(error => { if (hasCode(error, "ENOENT")) return []; throw error; });
    const records: Checkpoint[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const checkpoint = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as Checkpoint;
      if (checkpoint.version === 1 && checkpoint.sessionId === sessionId && checkpoint.workspace === this.workspace) records.push(checkpoint);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  summary(checkpoint: Checkpoint): CheckpointSummary {
    const { files, contextHash: _context, changes, ...rest } = checkpoint;
    return { ...rest, unprotected: new Set([...Object.keys(files).filter(relative => files[relative].kind === "unprotected"), ...(changes ?? []).filter(change => change.uncertain).map(change => change.path)]).size,
      changes: (changes ?? []).map(({ before, after, ...change }) => ({ ...change,
        operation: before.kind === "absent" ? "created" : after.kind === "absent" ? "deleted" : "updated",
        restorable: !change.uncertain && before.kind !== "unprotected" && after.kind !== "unprotected",
        binary: (before.kind === "file" && before.binary) || (after.kind === "file" && after.binary) })) };
  }
  async changes(before: Checkpoint, after: Checkpoint, tracked = new Map<string, { before: FileVersion; after?: FileVersion }>()): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    for (const relative of new Set([...Object.keys(before.files), ...Object.keys(after.files), ...tracked.keys()])) {
      const tool = tracked.get(relative);
      const left = tool?.before ?? before.files[relative] ?? ABSENT, right = tool?.after ?? after.files[relative] ?? ABSENT;
      if (same(left, right)) continue;
      let added = 0, removed = 0;
      if (left.kind !== "unprotected" && right.kind !== "unprotected" && !(left.kind === "file" && left.binary) && !(right.kind === "file" && right.binary)) {
        const oldText = left.kind === "file" ? (await this.readObject(left.hash)).toString("utf8") : null;
        const newText = right.kind === "file" ? (await this.readObject(right.hash)).toString("utf8") : "";
        if ((oldText?.length ?? 0) + newText.length <= 500_000) {
          for (const hunk of buildStructuredPatch(oldText, newText)) for (const line of hunk.lines) {
            if (line.type === "add") added++; else if (line.type === "delete") removed++;
          }
        }
      }
      changes.push({ path: relative, before: left, after: right, source: tool?.after ? "file_tool" : "observed", added, removed });
    }
    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }
  async selectChanges(checkpoint: Checkpoint, scope: CheckpointRequest["scope"], activeTurns?: Set<string>): Promise<FileChange[]> {
    if (!scope || scope === "turn") return checkpoint.changes ?? [];
    const records = (await this.list(checkpoint.sessionId)).filter(item => item.phase === "after" && (!activeTurns || activeTurns.has(item.turnId)) && (scope === "session" || item.createdAt >= checkpoint.createdAt));
    const first = records[0];
    const firstBefore = first?.beforeId ? await this.readCheckpoint(first.beforeId, checkpoint.sessionId) : first;
    const cutoff = scope === "session" ? firstBefore?.createdAt ?? checkpoint.createdAt : checkpoint.createdAt;
    const events = records.map(record => ({ createdAt: record.createdAt, changes: record.changes ?? [] }));
    for (const operation of await this.operations(checkpoint.sessionId)) {
      if (operation.createdAt < cutoff) continue;
      const applied = operation.files.filter(file => operation.applied.includes(file.path));
      events.push({ createdAt: operation.createdAt, changes: applied.map(file => ({ path: file.path, before: file.expected, after: file.target, source: file.source, added: 0, removed: 0 })) });
    }
    events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const cumulative = new Map<string, FileChange>();
    for (const record of events) for (const change of record.changes) {
      const earlier = cumulative.get(change.path);
      if (earlier && !same(earlier.after, change.before)) {
        cumulative.set(change.path, { ...change, before: { kind: "unprotected", reason: "Another edit occurred between these turns. Restore turns individually." } });
      } else cumulative.set(change.path, { ...change, before: earlier?.before ?? change.before, ...((earlier?.uncertain || change.uncertain) ? { uncertain: true } : {}) });
    }
    const combined = [...cumulative.values()].filter(change => !same(change.before, change.after));
    const left = { ...checkpoint, files: Object.fromEntries(combined.map(change => [change.path, change.before])) };
    const right = { ...checkpoint, files: Object.fromEntries(combined.map(change => [change.path, change.after])) };
    const stats = await this.changes(left, right);
    return combined.map(change => ({ ...change, added: stats.find(item => item.path === change.path)?.added ?? 0, removed: stats.find(item => item.path === change.path)?.removed ?? 0 }));
  }
  async diff(sessionId: string, checkpointId: string, relative: string, scope?: CheckpointRequest["scope"], activeTurns?: Set<string>) {
    const checkpoint = await this.readCheckpoint(checkpointId, sessionId);
    const change = (await this.selectChanges(checkpoint, scope, activeTurns)).find(item => item.path === relative);
    if (!change) throw new CheckpointError("FILE_NOT_RECORDED", "File is not part of this checkpoint.");
    const text = async (version: FileVersion) => version.kind === "file" && !version.binary && version.size <= 500_000 ? (await this.readObject(version.hash)).toString("utf8") : null;
    const oldContent = change.before.kind === "absent" ? "" : await text(change.before), newContent = change.after.kind === "absent" ? "" : await text(change.after);
    return { ...change, oldContent, newContent, hunks: oldContent !== null && newContent !== null ? buildStructuredPatch(change.before.kind === "absent" ? null : oldContent, newContent) : null };
  }
  async preview(sessionId: string, checkpointId: string, scope: CheckpointRequest["scope"] = "turn", mode: RestorePlan["mode"] = "files", context: Pick<RestorePlan, "contextBeforeHash" | "visibleSequences" | "visibleBeforeSequences"> = {}, activeTurns?: Set<string>): Promise<RestorePlan> {
    if (!["turn", "session", "since"].includes(scope) || !["files", "both", "conversation"].includes(mode)) throw new CheckpointError("INVALID_ACTION", "Invalid restore options.");
    const checkpoint = await this.readCheckpoint(checkpointId, sessionId);
    const before = checkpoint.beforeId ? await this.readCheckpoint(checkpoint.beforeId, sessionId) : checkpoint;
    const first = scope === "session" ? (await this.list(sessionId)).find(item => item.phase === "before" && (!activeTurns || activeTurns.has(item.turnId))) : before;
    const plan: RestorePlan = { id: randomUUID(), sessionId, checkpointId, createdAt: new Date().toISOString(), mode, scope, files: [], contextHash: first?.contextHash, ...context };
    for (const change of await this.selectChanges(checkpoint, scope, activeTurns)) {
      const current = await this.captureFile(change.path, false);
      plan.files.push({ path: change.path, expected: current, target: change.before, source: change.source,
        status: change.uncertain || change.before.kind === "unprotected" || change.after.kind === "unprotected" || current.kind === "unprotected" ? "unprotected" : same(current, change.before) ? "unchanged" : same(current, change.after) ? "ready" : "conflict" });
    }
    await this.writeRecord("plans", plan);
    return plan;
  }
  async restore(sessionId: string, planId: string, selectedPaths?: string[]): Promise<RestoreOperation> {
    const plan = await this.readPlan(sessionId, planId);
    if (plan.sessionId !== sessionId) throw new CheckpointError("CHECKPOINT_MISMATCH", "Restore belongs to another conversation.");
    const operationPath = this.recordPath("operations", plan.id);
    try {
      const existing = JSON.parse(await fs.readFile(operationPath, "utf8")) as RestoreOperation;
      if (existing.status !== "complete") throw new CheckpointError("RESTORE_INTERRUPTED", `Restore ${existing.id} was interrupted. Undo this operation before retrying.`);
      return existing;
    }
    catch (error) { if (!hasCode(error, "ENOENT")) throw error; }
    if (Date.now() - Date.parse(plan.createdAt) > 15 * 60_000) throw new CheckpointError("STALE_PLAN", "Restore preview expired. Review the current files again.");
    const chosen = plan.mode === "conversation" ? [] : plan.files.filter(file => file.status === "ready" && (!selectedPaths || selectedPaths.includes(file.path)));
    for (const file of chosen) {
      if (!same(await this.captureFile(file.path, false), file.expected)) throw new CheckpointError("STALE_PLAN", `${file.path} changed after the preview. Review it again.`);
      if (file.target.kind === "file") await this.readObject(file.target.hash);
    }
    if (plan.mode !== "files" && !plan.contextHash) throw new CheckpointError("CONTEXT_UNAVAILABLE", "This checkpoint has no saved conversation context.");
    const before = await this.capture(sessionId, "restore", "before_restore");
    before.contextHash = plan.contextBeforeHash;
    await this.save(before);
    const operation: RestoreOperation = { ...plan, beforeId: before.id, status: "prepared", applied: [], skipped: plan.files.filter(file => !chosen.includes(file)).map(file => file.path) };
    await this.writeRecord("operations", operation);
    if (plan.mode === "conversation") { operation.status = "complete"; await this.writeRecord("operations", operation, true); return operation; }
    operation.status = "applying";
    await this.writeRecord("operations", operation, true);
    try {
      for (const file of chosen) {
        if (!same(await this.captureFile(file.path, false), file.expected)) throw new CheckpointError("STALE_PLAN", `${file.path} changed during restore.`);
        operation.pendingPath = file.path;
        await this.writeRecord("operations", operation, true);
        await this.applyFile(file.path, file.target);
        operation.applied.push(file.path);
        delete operation.pendingPath;
        await this.writeRecord("operations", operation, true);
      }
      operation.status = "complete";
    } catch (error) {
      operation.status = "needs_recovery";
      await this.writeRecord("operations", operation, true);
      throw new CheckpointError("RESTORE_INTERRUPTED", `Restore interrupted; undo operation ${operation.id} to recover. ${error instanceof Error ? error.message : ""}`);
    }
    await this.writeRecord("operations", operation, true);
    return operation;
  }
  async readPlan(sessionId: string, id: string): Promise<RestorePlan> {
    const plan = JSON.parse(await fs.readFile(this.recordPath("plans", id), "utf8")) as RestorePlan;
    if (plan.sessionId !== sessionId) throw new CheckpointError("CHECKPOINT_MISMATCH", "Restore belongs to another conversation.");
    return plan;
  }
  private async applyFile(relative: string, version: FileVersion): Promise<void> {
    if (version.kind === "unprotected") throw new CheckpointError("UNPROTECTED", "Cannot restore an unprotected file.");
    const target = await this.resolveFile(relative);
    if (version.kind === "absent") { await fs.unlink(target).catch(error => { if (!hasCode(error, "ENOENT")) throw error; }); return; }
    const content = await this.readObject(version.hash);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.pilotdeck-restore-${randomUUID()}`);
    try {
      await fs.writeFile(temporary, content, { flag: "wx", mode: version.mode });
      await fs.chmod(temporary, version.mode);
      await this.resolveFile(relative);
      const current = await fs.lstat(target).catch(error => { if (hasCode(error, "ENOENT")) return undefined; throw error; });
      if (current?.isSymbolicLink() || (current && !current.isFile())) throw new CheckpointError("UNSAFE_PATH", "Restore target is no longer a regular file.");
      await fs.rename(temporary, target);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  async undoPreview(sessionId: string, operationId: string, context: Pick<RestorePlan, "contextBeforeHash" | "visibleBeforeSequences"> & { mode?: RestorePlan["mode"] } = {}): Promise<RestorePlan> {
    const operation = JSON.parse(await fs.readFile(this.recordPath("operations", operationId), "utf8")) as RestoreOperation;
    if (operation.sessionId !== sessionId) throw new CheckpointError("CHECKPOINT_MISMATCH", "Restore belongs to another conversation.");
    const before = await this.readCheckpoint(operation.beforeId, sessionId);
    const plan: RestorePlan = { id: randomUUID(), checkpointId: before.id, sessionId, createdAt: new Date().toISOString(), mode: operation.mode, files: [], contextHash: operation.contextBeforeHash, visibleSequences: operation.visibleBeforeSequences, undoOf: operation.id, ...context };
    const affected = new Set(operation.applied);
    if (operation.pendingPath) {
      const pending = operation.files.find(file => file.path === operation.pendingPath);
      if (pending && !same(await this.captureFile(pending.path, false), pending.expected)) affected.add(pending.path);
    }
    for (const relative of affected) {
      const original = operation.files.find(file => file.path === relative)!;
      const current = await this.captureFile(relative, false);
      plan.files.push({ path: relative, expected: current, target: original.expected, source: original.source,
        status: same(current, original.target) ? "ready" : same(current, original.expected) ? "unchanged" : "conflict" });
    }
    await this.writeRecord("plans", plan);
    return plan;
  }
  async operations(sessionId: string): Promise<RestoreOperation[]> {
    const directory = path.join(this.directory, "operations"), names = await fs.readdir(directory).catch(error => { if (hasCode(error, "ENOENT")) return []; throw error; });
    const records: RestoreOperation[] = [];
    for (const name of names.filter(name => name.endsWith(".json"))) {
      const record = JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as RestoreOperation;
      if (record.sessionId === sessionId) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async saveEdit(edit: { id: string; beforeId: string; path: string; before: FileVersion; after?: FileVersion }, update = false): Promise<void> {
    await this.writeRecord("edits", edit, update);
  }
  /** Caller owns the lease. Unknown post-crash edits remain reviewable but cannot be overwritten. */
  async recoverInterrupted(sessionId: string): Promise<void> {
    const records = await this.list(sessionId), completed = new Set(records.map(record => record.beforeId));
    const orphan = records.filter(record => record.phase === "before" && !completed.has(record.id)).at(-1);
    if (!orphan || records.some(record => record.phase === "after" && record.createdAt > orphan.createdAt)) return;
    const names = await fs.readdir(path.join(this.directory, "edits")).catch(error => { if (hasCode(error, "ENOENT")) return []; throw error; });
    const tracked = new Map<string, { before: FileVersion; after?: FileVersion }>();
    for (const name of names.filter(value => value.endsWith(".json"))) {
      const edit = JSON.parse(await fs.readFile(path.join(this.directory, "edits", name), "utf8")) as { beforeId: string; path: string; before: FileVersion; after?: FileVersion };
      if (edit.beforeId === orphan.id && edit.after) tracked.set(edit.path, edit);
    }
    const after = await this.capture(sessionId, orphan.turnId, "after");
    after.beforeId = orphan.id; after.status = "incomplete";
    after.changes = (await this.changes(orphan, after, tracked)).map(change => ({ ...change, ...(change.source === "observed" ? { uncertain: true } : {}) }));
    await this.save(after);
  }
  /** Keep 100 rounds and completed restores per conversation, then collect unused blobs. Caller owns the lease. */
  async prune(retain = 100): Promise<void> {
    const readRecords = async (kind: "manifests" | "plans" | "operations" | "edits") => {
      const names = await fs.readdir(path.join(this.directory, kind)).catch(error => { if (hasCode(error, "ENOENT")) return []; throw error; });
      return Promise.all(names.filter(name => name.endsWith(".json")).map(async name => ({ name, record: JSON.parse(await fs.readFile(path.join(this.directory, kind, name), "utf8")) as Checkpoint & RestoreOperation })));
    };
    const [manifests, plans, operations, edits] = await Promise.all([readRecords("manifests"), readRecords("plans"), readRecords("operations"), readRecords("edits")]);
    const keep = new Set<string>(), retainedOperations = new Set<string>();
    const sessions = new Set(manifests.map(item => item.record.sessionId));
    for (const sessionId of sessions) {
      const rounds = manifests.filter(item => item.record.sessionId === sessionId && item.record.phase === "after").sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt)).slice(0, retain);
      for (const { record } of rounds) { keep.add(record.id); if (record.beforeId) keep.add(record.beforeId); }
      const restored = operations.filter(item => item.record.sessionId === sessionId).sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
      for (const { record } of restored.filter((item, index) => item.record.status !== "complete" || index < retain)) {
        retainedOperations.add(record.id); keep.add(record.beforeId); keep.add(record.checkpointId);
      }
      const completedBefore = new Set(manifests.map(item => item.record.beforeId));
      for (const { record } of manifests.filter(item => item.record.sessionId === sessionId && item.record.phase === "before" && !completedBefore.has(item.record.id)).slice(-retain)) keep.add(record.id);
    }
    const retainedPlans = plans.filter(item => Date.now() - Date.parse(item.record.createdAt) <= 15 * 60_000);
    for (const { record } of retainedPlans) keep.add(record.checkpointId);
    // A retained old checkpoint still needs its before manifest.
    for (const { record } of manifests) if (keep.has(record.id) && record.beforeId) keep.add(record.beforeId);
    const referenced = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["hash", "contextHash", "contextBeforeHash"].includes(key) && typeof child === "string") referenced.add(child);
        else visit(child);
      }
    };
    const retainedEdits = new Set(edits.filter(item => keep.has(item.record.beforeId)).map(item => item.record.id));
    for (const [kind, records, retained] of [["manifests", manifests, keep], ["operations", operations, retainedOperations], ["plans", plans, new Set(retainedPlans.map(item => item.record.id))], ["edits", edits, retainedEdits]] as const) {
      for (const { name, record } of records) {
        if (retained.has(record.id)) visit(record); else await fs.unlink(path.join(this.directory, kind, name));
      }
    }
    const objects = await fs.readdir(path.join(this.directory, "objects")).catch(error => { if (hasCode(error, "ENOENT")) return []; throw error; });
    for (const hash of objects) if (/^[a-f0-9]{64}$/.test(hash) && !referenced.has(hash)) await fs.unlink(this.objectPath(hash));
  }
}

/** One instance per session; child-agent writes use their parent's active lease. */
export class WorkspaceCheckpoints {
  private active?: { store: CheckpointStore; before: Checkpoint; tracked: Map<string, { id: string; before: FileVersion; after?: FileVersion }>; pending: Map<string, Promise<void>>; release: () => void };
  constructor(private readonly workspace: string, private readonly pilotHome: string) {}
  async beginTurn(sessionId: string, turnId: string, messages: CanonicalMessage[], signal?: AbortSignal): Promise<void> {
    const store = await getCheckpointStore(this.workspace, this.pilotHome), release = await store.acquire();
    try {
      if (signal?.aborted) throw new CheckpointError("ABORTED", "Turn stopped before its checkpoint was captured.");
      await store.recoverInterrupted(sessionId);
      const before = await store.capture(sessionId, turnId, "before", messages);
      await store.save(before);
      this.active = { store, before, tracked: new Map(), pending: new Map(), release };
    } catch (error) { release(); throw error; }
  }
  async trackEdit(filePath: string, _turnId: string): Promise<void> {
    const active = this.active;
    const relative = this.relativePath(filePath);
    if (!active || !relative) return;
    if (active.tracked.has(relative)) return;
    const existing = active.pending.get(relative);
    if (existing) return existing;
    const capture = (async () => {
      const before = await active.store.captureFile(relative);
      if (before.kind === "unprotected") throw new CheckpointError("BACKUP_UNAVAILABLE", `Cannot protect ${relative}: ${before.reason}`);
      const edit = { id: randomUUID(), before };
      await active.store.saveEdit({ ...edit, path: relative, beforeId: active.before.id });
      active.tracked.set(relative, edit);
    })();
    active.pending.set(relative, capture);
    try { await capture; } finally { active.pending.delete(relative); }
  }
  async recordEdit(filePath: string, _turnId: string, writtenContent?: string): Promise<void> {
    const active = this.active;
    const relative = this.relativePath(filePath);
    if (!active || !relative) return;
    const tracked = active.tracked.get(relative);
    if (tracked) {
      tracked.after = await active.store.captureFile(relative);
      if (writtenContent !== undefined) {
        const content = Buffer.from(writtenContent);
        tracked.after = content.length > MAX_FILE_BYTES ? { kind: "unprotected", reason: "File exceeds the 10 MB checkpoint limit." } : {
          kind: "file", hash: await active.store.putObject(content), size: content.length, binary: content.includes(0),
          mode: tracked.after.kind === "file" ? tracked.after.mode : tracked.before.kind === "file" ? tracked.before.mode : 0o644,
        };
      }
      await active.store.saveEdit({ ...tracked, path: relative, beforeId: active.before.id }, true);
    }
  }
  private relativePath(filePath: string): string | undefined {
    const target = path.resolve(filePath), root = this.active?.store.workspace;
    if (!root) return;
    const alias = path.resolve(this.workspace);
    const base = inside(root, target) ? root : inside(alias, target) ? alias : undefined;
    return base ? path.relative(base, target).split(path.sep).join("/") : undefined;
  }
  async finishTurn(status: "complete" | "incomplete"): Promise<CheckpointSummary | undefined> {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    try {
      const after = await active.store.capture(active.before.sessionId, active.before.turnId, "after");
      after.beforeId = active.before.id;
      after.status = status;
      after.changes = await active.store.changes(active.before, after, active.tracked);
      await active.store.save(after);
      // Cleanup cannot make an otherwise durable checkpoint fail.
      await active.store.prune().catch(() => {});
      return active.store.summary(after);
    } finally { active.release(); }
  }
}

function inside(root: string, target: string): boolean { const relative = path.relative(root, target); return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); }
function canonicalPath(value: string): string {
  const absolute = path.resolve(value);
  try { return realpathSync(absolute); } catch { return path.dirname(absolute) === absolute ? absolute : path.join(canonicalPath(path.dirname(absolute)), path.basename(absolute)); }
}
function digest(content: Buffer): string { return createHash("sha256").update(content).digest("hex"); }
function hasCode(error: unknown, code: string): boolean { return !!error && typeof error === "object" && "code" in error && error.code === code; }
function same(left: FileVersion, right: FileVersion): boolean { return left.kind === right.kind && (left.kind === "absent" || (left.kind === "file" && right.kind === "file" && left.hash === right.hash && left.mode === right.mode)); }
