import type { NineGClawHooksSettings } from "../../hooks/protocol/settings.js";

export type NineGClawPluginManifest = {
  name: string;
  version?: string;
  description?: string;
  commands?: string | string[];
  agents?: string | string[];
  skills?: string | string[];
  hooks?: string | NineGClawHooksSettings;
  mcpServers?: Record<string, unknown>;
  lspServers?: Record<string, unknown>;
  outputStyles?: string | string[];
  marketplace?: NineGClawMarketplaceReference;
  mcpb?: string;
  settings?: Record<string, unknown>;
};

export type NineGClawMarketplaceReference = {
  name: string;
  plugin: string;
  version?: string;
  source?: "marketplace" | "git" | "zip" | "mcpb";
  url?: string;
};
