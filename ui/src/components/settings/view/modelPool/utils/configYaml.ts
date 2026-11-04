import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { NineGClawConfig } from "../types";

export function safeParseYaml(text: string): NineGClawConfig | null {
  try {
    const value = parseYaml(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as NineGClawConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function configToYamlString(config: NineGClawConfig): string {
  return stringifyYaml(config, { indent: 2, lineWidth: 0 });
}
