import type { NineGClawToolResult } from "../protocol/result.js";
import type { NineGClawToolCall, NineGClawToolRuntimeContext } from "../protocol/types.js";

export type NineGClawToolScheduler = {
  executeAll(calls: NineGClawToolCall[], context: NineGClawToolRuntimeContext): Promise<NineGClawToolResult[]>;
};
