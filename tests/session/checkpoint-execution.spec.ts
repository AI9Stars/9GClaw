import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceCheckpoints, getCheckpointStore } from "../../src/session/checkpoints/WorkspaceCheckpoints.js";
import { createExecuteCodeTool } from "../../src/tool/builtin/executeCode.js";
import { createReadFileTool } from "../../src/tool/builtin/readFile.js";
import { createWriteFileTool } from "../../src/tool/builtin/writeFile.js";
import { createTaskCreateTool, createTaskWaitTool } from "../../src/tool/builtin/taskTools.js";
import { BackgroundTaskRuntime } from "../../src/task/runtime/BackgroundTaskRuntime.js";
import { resolveDefaultCommandShell } from "../../src/runtime/commandShell.js";
import type { PilotDeckToolRuntimeContext } from "../../src/tool/protocol/types.js";

async function fixture(t: test.TestContext) {
  // Detached children and task wait timers are unref'ed in the server runtime.
  const alive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(alive));
  const base = await mkdtemp(join(tmpdir(), "checkpoint-execution-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const workspace = join(base, "workspace"), home = join(base, "home");
  await mkdir(workspace); await mkdir(home);
  const history = new WorkspaceCheckpoints(workspace, home), store = await getCheckpointStore(workspace, home);
  const context: PilotDeckToolRuntimeContext = {
    cwd: workspace, env: process.env, sessionId: "session", turnId: "turn", fileHistory: history,
    permissionMode: "bypassPermissions", permissionContext: { mode: "bypassPermissions", cwd: workspace,
      additionalWorkingDirectories: [], canPrompt: false, bypassAvailable: true, rules: { allow: [], deny: [], ask: [] } },
  };
  context.executeTool = async call => {
    const input = call.input as { file_path: string; content: string };
    const output = call.name === "read_file" ? await createReadFileTool().execute(input, context)
      : call.name === "write_file" ? await createWriteFileTool().execute(input, context) : assert.fail(`Unexpected nested tool ${call.name}`);
    return { ...output, toolCallId: call.id, toolName: call.name, type: "success", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  };
  const file = join(workspace, "a.txt"); await writeFile(file, "A");
  await history.beginTurn("session", "turn", []);
  const toolWrite = async (content: string) => {
    await createReadFileTool().execute({ file_path: "a.txt" }, context);
    await createWriteFileTool().execute({ file_path: "a.txt", content }, context);
  };
  return { workspace, home, history, store, context, file, toolWrite };
}

async function assertRestorable(f: Awaited<ReturnType<typeof fixture>>, expected: string) {
  const checkpoint = (await f.history.finishTurn("complete"))!;
  const diff = await f.store.diff("session", checkpoint.id, "a.txt");
  assert.equal(diff.oldContent, "A"); assert.equal(diff.newContent, expected);
  const plan = await f.store.preview("session", checkpoint.id);
  assert.equal(plan.files[0].status, "ready");
  const operation = await f.store.restore("session", plan.id);
  assert.equal(await readFile(f.file, "utf8"), "A");
  await f.store.restore("session", (await f.store.undoPreview("session", operation.id)).id);
  assert.equal(await readFile(f.file, "utf8"), expected);
}

for (const order of ["python-tool", "tool-python", "nested-tools", "failed-python"]) {
  test(`execute_code ${order} preserves the entire turn and supports restore/undo`, async t => {
    const f = await fixture(t);
    if (order !== "python-tool") await f.toolWrite("B");
    const code = "from pathlib import Path\nPath('a.txt').write_text('C')\n" +
      (order === "nested-tools" ? "from pilotdeck_tools import read_file, write_file\nread_file('a.txt')\nwrite_file('a.txt', 'D')\nPath('a.txt').write_text('E')\n" :
        order === "failed-python" ? "raise RuntimeError('intentional failure')\n" : "");
    const result = await createExecuteCodeTool().execute({ code, timeout_seconds: 10 }, f.context);
    assert.equal(result.data!.status, order === "failed-python" ? "error" : "success", result.data!.error);
    if (order === "python-tool") await f.toolWrite("D");
    await assertRestorable(f, order === "nested-tools" ? "E" : order === "python-tool" ? "D" : "C");
  });
}

test("Python execution preserves manual edits before and after its tracked writes", async t => {
  for (const timing of ["before", "after"]) {
    const f = await fixture(t); await f.toolWrite("B");
    if (timing === "before") await writeFile(f.file, "manual");
    assert.equal((await createExecuteCodeTool().execute({ code: "from pathlib import Path\nPath('a.txt').write_text('C')" }, f.context)).data!.status, "success");
    if (timing === "after") await writeFile(f.file, "manual");
    const checkpoint = (await f.history.finishTurn("complete"))!;
    const plan = await f.store.preview("session", checkpoint.id);
    assert.equal(plan.files[0].status, timing === "before" ? "unprotected" : "conflict");
    await f.store.restore("session", plan.id);
    assert.equal(await readFile(f.file, "utf8"), timing === "after" ? "manual" : "C");
  }
});

function nodeCommand(code: string) {
  const shell = resolveDefaultCommandShell();
  return `${shell.kind === "pwsh" ? "& " : ""}"${process.execPath.replaceAll("\\", "/")}" -e "${code}"`;
}

for (const order of ["task-tool", "tool-task", "failed-task"]) {
  test(`background ${order} captures completion before task_wait returns`, async t => {
    const f = await fixture(t), runtime = new BackgroundTaskRuntime();
    if (order !== "task-tool") await f.toolWrite("B");
    const task = await createTaskCreateTool(runtime).execute({ command: nodeCommand("require('node:fs').writeFileSync('a.txt','C');" + (order === "failed-task" ? "process.exitCode=1;" : "")) }, f.context);
    const result = await createTaskWaitTool(runtime).execute({ taskId: task.data!.taskId, timeoutMs: 10_000 }, f.context);
    assert.equal(result.data!.status, order === "failed-task" ? "failed" : "completed");
    if (order === "task-tool") await f.toolWrite("D");
    await assertRestorable(f, order === "task-tool" ? "D" : "C");
  });
}

class ControlledChild extends EventEmitter {
  readonly stdout = new PassThrough(); readonly stderr = new PassThrough(); readonly pid = 42;
  unref() {}
  finish() { this.emit("exit", 0, null); }
}

test("cross-turn background completion cannot rewrite old checkpoints or a new turn's journal", async t => {
  const f = await fixture(t); await f.toolWrite("B");
  const child = new ControlledChild(), runtime = new BackgroundTaskRuntime({ spawn: (() => child) as never });
  const task = await createTaskCreateTool(runtime).execute({ command: "controlled writer" }, f.context);
  const first = (await f.history.finishTurn("complete"))!;
  assert.equal(first.changes[0].restorable, false); assert.equal(f.store.busy, true);
  const newHistory = new WorkspaceCheckpoints(f.workspace, f.home);
  await newHistory.beginTurn("session", "next", []);
  await writeFile(f.file, "C"); child.finish();
  await createTaskWaitTool(runtime).execute({ taskId: task.data!.taskId, timeoutMs: 1000 }, f.context);
  const second = (await newHistory.finishTurn("complete"))!;
  assert.equal(f.store.busy, false);
  assert.equal((await f.store.diff("session", first.id, "a.txt")).newContent, "B");
  assert.equal((await f.store.preview("session", first.id)).files[0].status, "unprotected");
  assert.equal((await f.store.diff("session", second.id, "a.txt")).newContent, "C");
  assert.equal(second.changes[0].restorable, false);
  await f.history.beginTurn("session", "last", []); await f.toolWrite("D");
  const third = (await f.history.finishTurn("complete"))!;
  assert.equal((await f.store.preview("session", third.id)).files[0].status, "ready");
});

test("turn completion flushes a task finalization already capturing its postimage", async t => {
  const f = await fixture(t); await f.toolWrite("B");
  const child = new ControlledChild(), runtime = new BackgroundTaskRuntime({ spawn: (() => child) as never });
  await createTaskCreateTool(runtime).execute({ command: "controlled writer" }, f.context);
  await writeFile(f.file, "C"); child.finish();
  await assertRestorable(f, "C");
});
