export class NineGClawLifecycleRuntimeError extends Error {
  readonly name = "NineGClawLifecycleRuntimeError";

  constructor(
    readonly code: "hook_blocked" | "hook_failed",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
