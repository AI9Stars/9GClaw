import type {
  NineGClawToolAvailability,
  NineGClawToolAvailabilityContext,
  NineGClawToolDefinition,
} from "../protocol/types.js";
import { ToolRegistry, type ToolUnavailableDiagnostic } from "./ToolRegistry.js";

export type NineGClawUnavailableToolDiagnostic = {
  toolName: string;
  code: Exclude<NineGClawToolAvailability, { ok: true }>["code"];
  reason: string;
};

export type FilterAvailableToolsResult = {
  registry: ToolRegistry;
  unavailable: NineGClawUnavailableToolDiagnostic[];
};

export async function filterAvailableTools(
  registry: ToolRegistry,
  context: NineGClawToolAvailabilityContext,
): Promise<FilterAvailableToolsResult> {
  const filtered = new ToolRegistry();
  const unavailable: NineGClawUnavailableToolDiagnostic[] = [];
  for (const { diagnostic, aliases } of registry.listUnavailableEntries()) {
    filtered.markUnavailable(diagnostic, aliases);
    unavailable.push(diagnostic);
  }
  const checkCache = new Map<
    NonNullable<NineGClawToolDefinition["checkAvailability"]>,
    Promise<NineGClawToolAvailability>
  >();

  for (const tool of registry.list()) {
    const availability = await resolveToolAvailability(tool, context, checkCache);
    if (availability.ok) {
      filtered.register(tool);
      continue;
    }

    const diagnostic: NineGClawUnavailableToolDiagnostic = {
      toolName: tool.name,
      code: availability.code,
      reason: availability.reason,
    };
    unavailable.push(diagnostic);
    const marked: ToolUnavailableDiagnostic = diagnostic;
    filtered.markUnavailable(marked, tool.aliases);
  }

  return { registry: filtered, unavailable };
}

async function resolveToolAvailability(
  tool: NineGClawToolDefinition,
  context: NineGClawToolAvailabilityContext,
  cache: Map<NonNullable<NineGClawToolDefinition["checkAvailability"]>, Promise<NineGClawToolAvailability>>,
): Promise<NineGClawToolAvailability> {
  const check = tool.checkAvailability;
  if (!check) {
    return { ok: true };
  }

  let promise = cache.get(check);
  if (!promise) {
    promise = Promise.resolve()
      .then(() => check(context))
      .catch((error): NineGClawToolAvailability => ({
        ok: false,
        code: "failed_check",
        reason: error instanceof Error ? error.message : String(error),
      }));
    cache.set(check, promise);
  }

  return promise;
}
