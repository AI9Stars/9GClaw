export type NineGClawToolErrorCode =
  | "tool_not_found"
  | "tool_unavailable"
  | "invalid_tool_input"
  | "permission_denied"
  | "permission_cancelled"
  | "permission_required"
  | "tool_execution_failed"
  | "tool_aborted"
  | "tool_timeout"
  | "result_too_large"
  | "path_not_allowed"
  | "file_not_found"
  | "file_conflict"
  | "unsupported_tool"
  | "setup_required"
  | "plan_mode_violation"
  | "ask_mode_violation";

export type NineGClawToolError = {
  code: NineGClawToolErrorCode;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class NineGClawToolRuntimeError extends Error {
  readonly code: NineGClawToolErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: NineGClawToolErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "NineGClawToolRuntimeError";
    this.code = code;
    this.details = details;
  }
}

export function toolError(
  code: NineGClawToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): NineGClawToolError {
  return { code, message, details };
}

export function normalizeToolError(error: unknown): NineGClawToolError {
  if (error instanceof NineGClawToolRuntimeError) {
    return toolError(error.code, error.message, error.details);
  }

  if (error instanceof Error) {
    return {
      code: "tool_execution_failed",
      message: error.message,
      cause: error,
    };
  }

  return {
    code: "tool_execution_failed",
    message: "Tool execution failed with a non-Error value.",
    cause: error,
  };
}
