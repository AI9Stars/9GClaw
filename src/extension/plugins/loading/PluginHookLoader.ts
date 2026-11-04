import type { NineGClawHooksSettings } from "../../hooks/protocol/settings.js";
import type { NineGClawLoadedPlugin } from "../protocol/plugin.js";

export function loadPluginHooks(plugins: NineGClawLoadedPlugin[]): NineGClawHooksSettings {
  const settings: NineGClawHooksSettings = {};
  for (const plugin of plugins) {
    for (const [event, matchers] of Object.entries(plugin.hooksConfig ?? {}) as Array<
      [keyof NineGClawHooksSettings, NonNullable<NineGClawHooksSettings[keyof NineGClawHooksSettings]>]
    >) {
      settings[event] = [
        ...(settings[event] ?? []),
        ...matchers.map((matcher) => ({
          ...matcher,
          pluginName: plugin.name,
          pluginId: `${plugin.name}@${plugin.source}`,
          pluginRoot: plugin.path,
        })),
      ];
    }
  }
  return settings;
}
