import type { NineGClawHookEffect, NineGClawLifecycleError } from "../../../lifecycle/protocol/effects.js";
import { matchHookMatcher } from "../config/matchHook.js";
import { matchHookCondition } from "../config/matchHookCondition.js";
import type { NineGClawHookEvent } from "../protocol/events.js";
import type { NineGClawHookInput } from "../protocol/input.js";
import type { NineGClawHookOutput, NineGClawHookSyncOutput } from "../protocol/output.js";
import type { NineGClawHookCommand, NineGClawHooksSettings } from "../protocol/settings.js";
import { CommandHookExecutor, NINEGCLAW_SESSION_END_HOOK_TIMEOUT_MS } from "./CommandHookExecutor.js";
import { PromptHookExecutor } from "./PromptHookExecutor.js";
import { HttpHookExecutor } from "./HttpHookExecutor.js";
import { AgentHookExecutor } from "./AgentHookExecutor.js";
import { AsyncHookRegistry } from "./AsyncHookRegistry.js";
import { CallbackHookExecutor } from "./CallbackHookExecutor.js";
import { HookExecutionEventBus, type NineGClawHookExecutionEvent } from "../events/HookExecutionEventBus.js";

export type HookRuntimeRunInput = {
  event: NineGClawHookEvent;
  hookInput: NineGClawHookInput;
  matchQuery?: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export type HookRuntimeRunResult = {
  effects: NineGClawHookEffect[];
  events: NineGClawHookExecutionEvent[];
  blockingErrors: NineGClawLifecycleError[];
  nonBlockingErrors: NineGClawLifecycleError[];
};

export class HookRuntime {
  constructor(
    private readonly settings: NineGClawHooksSettings = {},
    private readonly commandExecutor = new CommandHookExecutor(),
    private readonly eventBus = new HookExecutionEventBus(),
    private readonly asyncRegistry = new AsyncHookRegistry(),
    private readonly promptExecutor = new PromptHookExecutor(),
    private readonly httpExecutor = new HttpHookExecutor(),
    private readonly agentExecutor = new AgentHookExecutor(),
    private readonly callbackExecutor = new CallbackHookExecutor(),
  ) {}

  /**
   * Expose the {@link CallbackHookExecutor} so the caller can register
   * per-process callbacks (e.g. the gateway's interactive permission
   * hook) before the runtime starts dispatching events.
   */
  getCallbackExecutor(): CallbackHookExecutor {
    return this.callbackExecutor;
  }

  async run(input: HookRuntimeRunInput): Promise<HookRuntimeRunResult> {
    const effects: NineGClawHookEffect[] = [];
    const events: NineGClawHookExecutionEvent[] = [];
    const blockingErrors: NineGClawLifecycleError[] = [];
    const nonBlockingErrors: NineGClawLifecycleError[] = [];

    for (const { matcher, hook } of this.matchHooks(input)) {
      const hookName = matcher.pluginName ? `${matcher.pluginName}:${hook.type}` : hook.type;
      const started: NineGClawHookExecutionEvent = {
        type: "started",
        hookName,
        hookEvent: input.event,
      };
      events.push(started);
      this.eventBus.emit(started);

      const result = await this.executeHook(hook, input, matcher.pluginRoot);
      const response: NineGClawHookExecutionEvent = {
        type: "response",
        hookName,
        hookEvent: input.event,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        outcome: result.outcome,
      };
      events.push(response);
      this.eventBus.emit(response);

      if (result.output.type === "async") {
        this.asyncRegistry.register({
          id: `${hookName}:${Date.now()}`,
          startedAt: new Date(),
          hookName,
          hookEvent: input.event,
          stdout: result.stdout,
          stderr: result.stderr,
          responseDelivered: false,
          asyncRewake: hook.type === "command" ? hook.asyncRewake : undefined,
        });
      }

      if (result.outcome === "blocking") {
        const message = result.stderr || result.stdout || "Hook blocked execution.";
        blockingErrors.push({ code: "hook_blocking_error", message, hookName, exitCode: result.exitCode });
        effects.push({ type: "block", reason: message });
      } else if (result.outcome === "non_blocking_error" || result.outcome === "timeout" || result.outcome === "cancelled") {
        nonBlockingErrors.push({
          code: result.outcome === "cancelled" ? "hook_cancelled" : "hook_non_blocking_error",
          message: result.stderr || result.stdout || `Hook ended with outcome ${result.outcome}.`,
          hookName,
          exitCode: result.exitCode,
        });
      }

      effects.push(...effectsFromHookOutput(result.output, hookName));
    }

    return { effects, events, blockingErrors, nonBlockingErrors };
  }

  collectAsyncResponses(): ReturnType<AsyncHookRegistry["collectResponses"]> {
    return this.asyncRegistry.collectResponses();
  }

  removeDeliveredAsyncResponses(): void {
    this.asyncRegistry.removeDelivered();
  }

  private *matchHooks(input: HookRuntimeRunInput): Generator<{
    matcher: NonNullable<NineGClawHooksSettings[NineGClawHookEvent]>[number];
    hook: NineGClawHookCommand;
  }> {
    for (const matcher of this.settings[input.event] ?? []) {
      if (!matchHookMatcher(matcher.matcher, input.matchQuery)) {
        continue;
      }
      for (const hook of matcher.hooks) {
        if (
          matchHookCondition(hook.if, {
            toolName: typeof input.hookInput.toolName === "string" ? input.hookInput.toolName : undefined,
            toolInput: input.hookInput.toolInput,
          })
        ) {
          yield { matcher, hook };
        }
      }
    }
  }

  private executeHook(
    hook: NineGClawHookCommand,
    input: HookRuntimeRunInput,
    pluginRoot: string | undefined,
  ) {
    switch (hook.type) {
      case "command":
        return this.commandExecutor.execute({
          hook,
          hookInput: input.hookInput,
          cwd: pluginRoot ?? input.cwd,
          env: input.env,
          signal: input.signal,
          timeoutMs: input.event === "SessionEnd" ? NINEGCLAW_SESSION_END_HOOK_TIMEOUT_MS : undefined,
        });
      case "prompt":
        return this.promptExecutor.execute({ hook, hookInput: input.hookInput, signal: input.signal });
      case "http":
        return this.httpExecutor.execute({ hook, hookInput: input.hookInput, env: input.env, signal: input.signal });
      case "agent":
        return this.agentExecutor.execute({ hook, hookInput: input.hookInput, signal: input.signal });
      case "callback":
        return this.callbackExecutor.execute({ hook, hookInput: input.hookInput, signal: input.signal });
    }
  }
}

function effectsFromHookOutput(output: NineGClawHookOutput, hookName: string): NineGClawHookEffect[] {
  if (output.type === "async") {
    return [];
  }

  const effects: NineGClawHookEffect[] = [];
  if (output.systemMessage) {
    effects.push({ type: "system_message", content: output.systemMessage });
  }
  if (isBlockingOutput(output)) {
    effects.push({
      type: "block",
      reason: output.reason ?? output.stopReason ?? "Hook blocked execution.",
      stopReason: output.stopReason,
    });
  }
  if (output.specific) {
    const specific = output.specific;
    if (specific.additionalContext) {
      effects.push({ type: "additional_context", content: specific.additionalContext, source: hookName });
    }
    if (specific.initialUserMessage) {
      effects.push({ type: "initial_user_message", message: specific.initialUserMessage });
    }
    if (specific.watchPaths?.length) {
      effects.push({ type: "watch_paths", paths: specific.watchPaths });
    }
    if (specific.worktreePath) {
      effects.push({ type: "worktree_path", path: specific.worktreePath });
    }
    if (specific.permissionDecision) {
      effects.push({
        type: "permission_decision",
        behavior: specific.permissionDecision,
        reason: specific.permissionDecisionReason,
      });
    }
    if (specific.updatedInput) {
      effects.push({ type: "updated_tool_input", input: specific.updatedInput });
    }
    if (specific.updatedMCPToolOutput !== undefined) {
      effects.push({ type: "updated_mcp_tool_output", output: specific.updatedMCPToolOutput });
    }
    if (specific.decision) {
      effects.push({ type: "permission_request_result", result: specific.decision });
    }
    if (specific.retry) {
      effects.push({ type: "retry_permission_denied" });
    }
  }

  return effects;
}

function isBlockingOutput(output: NineGClawHookSyncOutput): boolean {
  return output.continue === false || output.decision === "block";
}
