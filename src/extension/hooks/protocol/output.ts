export type NineGClawPermissionHookDecision =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: unknown[];
    }
  | {
      behavior: "deny";
      message?: string;
      interrupt?: boolean;
    };

export type NineGClawHookSpecificOutput = {
  hookEventName: string;
  additionalContext?: string;
  initialUserMessage?: string;
  watchPaths?: string[];
  permissionDecision?: "allow" | "deny" | "ask" | "passthrough";
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
  updatedMCPToolOutput?: unknown;
  decision?: NineGClawPermissionHookDecision;
  retry?: boolean;
  worktreePath?: string;
};

export type NineGClawHookSyncOutput = {
  type: "sync";
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  reason?: string;
  systemMessage?: string;
  specific?: NineGClawHookSpecificOutput;
  raw?: unknown;
};

export type NineGClawHookAsyncOutput = {
  type: "async";
  raw?: unknown;
};

export type NineGClawHookOutput = NineGClawHookSyncOutput | NineGClawHookAsyncOutput;
