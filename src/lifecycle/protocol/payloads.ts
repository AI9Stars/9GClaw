import type { CanonicalMessage } from "../../model/index.js";
import type { NineGClawHookEvent } from "../../extension/hooks/protocol/events.js";
import type { NineGClawHookBaseInput } from "../../extension/hooks/protocol/input.js";
import type { NineGClawHookEffect, NineGClawLifecycleError } from "./effects.js";

export type LifecycleDispatchInput = {
  event: NineGClawHookEvent;
  baseInput: NineGClawHookBaseInput;
  payload?: Record<string, unknown>;
  matchQuery?: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
};

export type LifecycleDispatchResult = {
  effects: NineGClawHookEffect[];
  messages: CanonicalMessage[];
  events: unknown[];
  blockingErrors: NineGClawLifecycleError[];
  nonBlockingErrors: NineGClawLifecycleError[];
};

export function emptyLifecycleDispatchResult(): LifecycleDispatchResult {
  return {
    effects: [],
    messages: [],
    events: [],
    blockingErrors: [],
    nonBlockingErrors: [],
  };
}
