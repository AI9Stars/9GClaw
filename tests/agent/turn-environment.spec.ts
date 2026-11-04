import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";

import { buildTurnEnvironment } from "../../src/agent/loop/AgentLoop.js";

test("turn environment provides an isolated 9GClaw-owned work directory", () => {
  const cwd = resolve('/workspace/project');
  const env = buildTurnEnvironment(
    { PATH: "/custom/bin", KEEP_ME: "yes" },
    cwd,
    "web:s_123/unsafe",
    "turn:456 unsafe",
  );

  assert.equal(env.PATH, "/custom/bin");
  assert.equal(env.KEEP_ME, "yes");
  assert.equal(env.NINEGCLAW_SESSION_ID, "web:s_123/unsafe");
  assert.equal(env.NINEGCLAW_TURN_ID, "turn:456 unsafe");
  assert.equal(
    env.NINEGCLAW_WORK_DIR,
    join(cwd, ".9gclaw", "work", "web-s_123-unsafe", "turn-456-unsafe"),
  );
});

test("turn environment inherits the process environment when no override is configured", () => {
  const markerName = "NINEGCLAW_TURN_ENV_INHERITANCE_TEST";
  const previousMarker = process.env[markerName];
  process.env[markerName] = "inherited";

  try {
    const env = buildTurnEnvironment(undefined, "/workspace/project", "session", "turn");

    assert.equal(env[markerName], "inherited");
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
    assert.equal(env[pathKey], process.env[pathKey]);
  } finally {
    if (previousMarker === undefined) {
      delete process.env[markerName];
    } else {
      process.env[markerName] = previousMarker;
    }
  }
});
