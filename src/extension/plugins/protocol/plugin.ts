import type { NineGClawHooksSettings } from "../../hooks/protocol/settings.js";
import type { PromptContribution } from "../../contributions/PromptContribution.js";
import type { RouterContribution } from "../../contributions/RouterContribution.js";
import type { LoadedPluginCommand } from "../loading/PluginCommandLoader.js";
import type { NineGClawPluginManifest } from "./manifest.js";

export type NineGClawPluginSourceKind = "builtin" | "global" | "project";

export type NineGClawLoadedPlugin = {
  name: string;
  path: string;
  source: NineGClawPluginSourceKind;
  manifest: NineGClawPluginManifest;
  hooksConfig?: NineGClawHooksSettings;
  commands?: LoadedPluginCommand[];
  skills?: LoadedPluginCommand[];
  outputStyles?: LoadedPluginCommand[];
  mcpServers?: Record<string, unknown>;
  lspServers?: Record<string, unknown>;
  /**
   * Programmatic contributions are currently only available to builtin or
   * test-injected plugins. Disk-loaded JSON plugins cannot provide functions.
   */
  promptContributions?: PromptContribution[];
  routerContributions?: RouterContribution[];
};
