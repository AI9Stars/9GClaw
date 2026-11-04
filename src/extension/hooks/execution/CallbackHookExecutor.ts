import type { NineGClawHookInput } from "../protocol/input.js";
import type { NineGClawHookCommand } from "../protocol/settings.js";
import type { NineGClawHookOutput } from "../protocol/output.js";
import { parseHookOutput } from "./parseHookOutput.js";
import type { CommandHookExecutionResult } from "./CommandHookExecutor.js";

export type CallbackHookHandler = (input: {
  hookInput: NineGClawHookInput;
  signal?: AbortSignal;
}) => Promise<NineGClawHookOutput | string | void> | NineGClawHookOutput | string | void;

export class CallbackHookExecutor {
  private readonly callbacks = new Map<string, CallbackHookHandler>();

  register(name: string, handler: CallbackHookHandler): void {
    this.callbacks.set(name, handler);
  }

  unregister(name: string): void {
    this.callbacks.delete(name);
  }

  async execute(options: {
    hook: Extract<NineGClawHookCommand, { type: "callback" }>;
    hookInput: NineGClawHookInput;
    signal?: AbortSignal;
  }): Promise<CommandHookExecutionResult> {
    const callback = this.callbacks.get(options.hook.name);
    if (!callback) {
      return {
        stdout: "",
        stderr: `Callback hook ${options.hook.name} is not registered.`,
        outcome: "non_blocking_error",
        output: { type: "sync" },
      };
    }

    try {
      const result = await callback({ hookInput: options.hookInput, signal: options.signal });
      if (typeof result === "string") {
        return {
          stdout: result,
          stderr: "",
          exitCode: 0,
          outcome: "success",
          output: parseHookOutput(result),
        };
      }
      return {
        stdout: "",
        stderr: "",
        exitCode: 0,
        outcome: "success",
        output: result ?? { type: "sync" },
      };
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        outcome: "non_blocking_error",
        output: { type: "sync" },
      };
    }
  }
}
