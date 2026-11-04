import type { NineGClawToolResult } from "../protocol/result.js";
import type { NineGClawToolCall, NineGClawToolRuntimeContext } from "../protocol/types.js";
import type { ToolRuntime } from "../execution/ToolRuntime.js";
import type { NineGClawToolScheduler } from "./ToolScheduler.js";

export class SequentialToolScheduler implements NineGClawToolScheduler {
  constructor(private readonly runtime: ToolRuntime) {}

  async executeAll(
    calls: NineGClawToolCall[],
    context: NineGClawToolRuntimeContext,
  ): Promise<NineGClawToolResult[]> {
    const results: NineGClawToolResult[] = [];
    for (const call of calls) {
      results.push(await this.runtime.execute(call, context));
    }
    return results;
  }
}
