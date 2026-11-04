import assert from "node:assert/strict";
import test from "node:test";

import { GatewayBrowserClient } from "../../src/web/client/GatewayBrowserClient.js";
import { NINEGCLAW_GATEWAY_PROTOCOL_VERSION } from "../../src/gateway/protocol/version.js";
import { NINEGCLAW_GATEWAY_PROTOCOL_VERSION_WEB } from "../../src/web/client/protocol.js";

test("browser and canonical gateway clients use the same protocol version", () => {
  assert.equal(NINEGCLAW_GATEWAY_PROTOCOL_VERSION_WEB, NINEGCLAW_GATEWAY_PROTOCOL_VERSION);
});

test("browser gateway client exposes the steer RPCs added in protocol 1.1", () => {
  assert.equal(typeof GatewayBrowserClient.prototype.steerTurn, "function");
  assert.equal(typeof GatewayBrowserClient.prototype.cancelSteer, "function");
});
