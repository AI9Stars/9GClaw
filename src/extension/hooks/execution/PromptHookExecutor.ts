import type { NineGClawHookInput } from "../protocol/input.js";
import type { NineGClawHookCommand } from "../protocol/settings.js";
import { parseHookOutput } from "./parseHookOutput.js";
import type { CommandHookExecutionResult } from "./CommandHookExecutor.js";

export type PromptHookEvaluator = (input: {
  prompt: string;
  model?: string;
  hookInput: NineGClawHookInput;
  signal?: AbortSignal;
}) => Promise<string>;

export class PromptHookExecutor {
  constructor(private readonly evaluator?: PromptHookEvaluator) {}

  async execute(options: {
    hook: Extract<NineGClawHookCommand, { type: "prompt" }>;
    hookInput: NineGClawHookInput;
    signal?: AbortSignal;
  }): Promise<CommandHookExecutionResult> {
    if (!this.evaluator) {
      return {
        stdout: "",
        stderr: "Prompt hook evaluator is not configured.",
        outcome: "non_blocking_error",
        output: { type: "sync" },
      };
    }

    try {
      const stdout = await this.evaluator({
        prompt: options.hook.prompt.replace("$ARGUMENTS", JSON.stringify(options.hookInput)),
        model: options.hook.model,
        hookInput: options.hookInput,
        signal: options.signal,
      });
      return {
        stdout,
        stderr: "",
        exitCode: 0,
        outcome: "success",
        output: parseHookOutput(stdout),
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
