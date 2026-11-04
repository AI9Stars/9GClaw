import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, statSync } from "node:fs";
import type { NineGClawLoadedPlugin } from "../protocol/plugin.js";
import { parsePluginManifest } from "../config/parsePluginManifest.js";

const __filename = fileURLToPath(import.meta.url);
const BUILTIN_DIR = resolve(__filename, "..");

let _cache: NineGClawLoadedPlugin[] | undefined;

export function loadBuiltinPlugins(): NineGClawLoadedPlugin[] {
  if (_cache) return _cache;
  _cache = [];
  try {
    for (const name of readdirSync(BUILTIN_DIR)) {
      const pluginPath = resolve(BUILTIN_DIR, name);
      if (!statSync(pluginPath).isDirectory()) continue;
      const manifestPath = resolve(pluginPath, "plugin.json");
      try {
        statSync(manifestPath);
      } catch {
        continue;
      }
      const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
      const manifest = parsePluginManifest(raw);
      _cache.push({
        name: manifest.name,
        path: pluginPath,
        source: "builtin",
        manifest,
        mcpServers: manifest.mcpServers,
      });
    }
  } catch { /* builtin dir scan failed — fine, no builtins */ }
  return _cache;
}
