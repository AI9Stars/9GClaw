import type { NineGClawLoadedPlugin } from "../protocol/plugin.js";

export function discoverBuiltinPlugins(plugins: NineGClawLoadedPlugin[] = []): NineGClawLoadedPlugin[] {
  return plugins.filter((plugin) => plugin.source === "builtin");
}
