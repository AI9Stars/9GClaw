export const NINEGCLAW_HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  /**
   * @todo Notification — no semantic "user notification" scenario yet.
   * `broadcastNotification` is currently infrastructure-only (config reload).
   * Wire once Always-On task_notification or Feishu adapter matures.
   */
  "Notification",
  "UserPromptSubmit",
  "PreModelRequest",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "PermissionRequest",
  "PermissionDenied",
  "Setup",
  "ConfigChange",
  "InstructionsLoaded",
  /**
   * @todo CwdChanged — only meaningful in Always-On workspace switching;
   * regular sessions have a fixed cwd. Wire once in-session cwd switching
   * is supported.
   */
  "CwdChanged",
  /**
   * @todo FileChanged — could fire after write_file/edit_file tool success.
   * Requires injecting dispatch into ToolRuntime context (the AgentEventEmitter
   * callback mechanism is ready; implementation deferred to avoid scope creep).
   */
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "Elicitation",
  "ElicitationResult",
] as const;

export const NINEGCLAW_NOT_APPLICABLE_LEGACY_HOOK_EVENTS = [
  "TeammateIdle",
  "TaskCreated",
  "TaskCompleted",
] as const;

export type NineGClawHookEvent = (typeof NINEGCLAW_HOOK_EVENTS)[number];
export type NineGClawNotApplicableLegacyHookEvent =
  (typeof NINEGCLAW_NOT_APPLICABLE_LEGACY_HOOK_EVENTS)[number];

export function isNineGClawHookEvent(value: string): value is NineGClawHookEvent {
  return (NINEGCLAW_HOOK_EVENTS as readonly string[]).includes(value);
}
