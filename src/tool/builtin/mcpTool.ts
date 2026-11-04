import type { PermissionResult } from "../../permission/index.js";
import { NineGClawToolRuntimeError } from "../protocol/errors.js";
import type { NineGClawToolDefinition, NineGClawToolExecutionOutput } from "../protocol/types.js";
import type { NineGClawToolInputSchema } from "../protocol/schema.js";

export type NineGClawMcpToolAdapter = {
  callTool(serverId: string, toolName: string, input: unknown): Promise<unknown>;
};

export type CreateMcpToolOptions = {
  serverId: string;
  toolName: string;
  description?: string;
  inputSchema?: NineGClawToolInputSchema;
  adapter?: NineGClawMcpToolAdapter;
};

export function createMcpTool(options: CreateMcpToolOptions): NineGClawToolDefinition {
  const wireName = buildMcpToolWireName(options.serverId, options.toolName);
  return {
    name: wireName,
    description: options.description ?? `Call MCP tool ${options.serverId}/${options.toolName}.`,
    kind: "mcp",
    inputSchema: options.inputSchema ?? { type: "object", additionalProperties: true, properties: {} },
    maxResultBytes: 200_000,
    isReadOnly: () => true,
    isConcurrencySafe: () => false,
    isOpenWorld: () => true,
    checkPermissions: async (): Promise<PermissionResult> => ({ type: "passthrough" }),
    execute: async (input): Promise<NineGClawToolExecutionOutput> => {
      if (!options.adapter) {
        throw new NineGClawToolRuntimeError("unsupported_tool", "MCP adapter is not configured.");
      }
      const value = await options.adapter.callTool(options.serverId, options.toolName, input);
      return {
        content: [{ type: "json", value }],
        data: value,
        metadata: {
          mcp: {
            serverId: options.serverId,
            toolName: options.toolName,
            wireName,
          },
        },
      };
    },
  };
}

export function buildMcpToolWireName(serverId: string, toolName: string): string {
  return `mcp__${normalizeMcpName(serverId)}__${normalizeMcpName(toolName)}`;
}

function normalizeMcpName(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!normalized) {
    throw new NineGClawToolRuntimeError("invalid_tool_input", "MCP server and tool names must normalize to a name.");
  }
  return normalized;
}
