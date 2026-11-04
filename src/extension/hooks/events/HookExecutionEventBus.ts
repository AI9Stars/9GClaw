import type { NineGClawHookEvent } from "../protocol/events.js";

export type NineGClawHookExecutionEvent =
  | {
      type: "started";
      hookName: string;
      hookEvent: NineGClawHookEvent;
    }
  | {
      type: "response";
      hookName: string;
      hookEvent: NineGClawHookEvent;
      stdout: string;
      stderr: string;
      exitCode?: number;
      outcome: "success" | "blocking" | "non_blocking_error" | "cancelled" | "timeout";
    };

export type NineGClawHookExecutionEventHandler = (event: NineGClawHookExecutionEvent) => void;

export class HookExecutionEventBus {
  private handlers = new Set<NineGClawHookExecutionEventHandler>();

  subscribe(handler: NineGClawHookExecutionEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: NineGClawHookExecutionEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
