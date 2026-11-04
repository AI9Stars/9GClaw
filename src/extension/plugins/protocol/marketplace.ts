import type { NineGClawMarketplaceReference } from "./manifest.js";

export type NineGClawPluginMarketplaceStatus = "resolved" | "deferred";

export type NineGClawMarketplaceResolution = {
  status: NineGClawPluginMarketplaceStatus;
  reference: NineGClawMarketplaceReference;
  reason?: string;
};

export function resolveMarketplaceReference(reference: NineGClawMarketplaceReference): NineGClawMarketplaceResolution {
  if (reference.source === "git" || reference.source === "zip" || reference.source === "mcpb") {
    return {
      status: "deferred",
      reference,
      reason: `${reference.source} installation is not implemented in the local runtime.`,
    };
  }
  return { status: "resolved", reference };
}
