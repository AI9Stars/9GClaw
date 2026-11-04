import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlanFileManager } from "../../../src/tool/builtin/planFile.js";
import { resolveProjectStorageId } from "../../../src/pilot/index.js";

test("desktop runtime plan files are stored under pilotHome project artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "9gclaw-plan-runtime-"));
  try {
    const pilotHome = join(root, "pilot-home");
    const projectRoot = join(root, "Program Files", "9GClaw", "resources", "runtime");
    const manager = createPlanFileManager({
      projectRoot,
      pilotHome,
      env: { NINEGCLAW_DESKTOP: "1" },
    });

    const planDir = manager.getPlanDirectoryPath();

    assert.equal(
      planDir,
      join(pilotHome, "projects", resolveProjectStorageId(projectRoot, pilotHome), "plans"),
    );
    assert.ok(!planDir.includes(join(projectRoot, ".9gclaw")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real project plan files stay under the project .9gclaw directory", () => {
  const root = mkdtempSync(join(tmpdir(), "9gclaw-plan-project-"));
  try {
    const pilotHome = join(root, "pilot-home");
    const projectRoot = join(root, "repo");
    const manager = createPlanFileManager({
      projectRoot,
      pilotHome,
      env: { NINEGCLAW_DESKTOP: "1" },
    });

    assert.equal(manager.getPlanDirectoryPath(), join(projectRoot, ".9gclaw", "plans"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
