import type { NineGClawLoadedPlugin } from "../protocol/plugin.js";

export class PluginRegistry {
  private readonly plugins = new Map<string, NineGClawLoadedPlugin>();

  replaceAll(plugins: NineGClawLoadedPlugin[]): void {
    this.plugins.clear();
    for (const plugin of plugins) {
      this.plugins.set(`${plugin.name}@${plugin.source}`, plugin);
    }
  }

  list(): NineGClawLoadedPlugin[] {
    return [...this.plugins.values()];
  }
}
