import type { PermissionDecision, PermissionDecisionReason, PermissionMode } from "../../permission/index.js";
import type { NineGClawToolErrorCode } from "../protocol/errors.js";

export type NineGClawPermissionAuditRecord = {
  type: "permission";
  sessionId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  mode: PermissionMode;
  decision: PermissionDecision["type"];
  reason: PermissionDecisionReason;
  createdAt: string;
};

export type NineGClawToolAuditRecord = {
  type: "tool";
  sessionId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  status: "success" | "error";
  errorCode?: NineGClawToolErrorCode;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type NineGClawToolAuditRecorder = {
  recordPermission(record: NineGClawPermissionAuditRecord): void | Promise<void>;
  recordTool(record: NineGClawToolAuditRecord): void | Promise<void>;
};
