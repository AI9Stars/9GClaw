import type { NineGClawConfig } from "../../modelPool/types";

export function isCronConfigEnabled(config: NineGClawConfig): boolean {
  return config.cron?.enabled !== false;
}
