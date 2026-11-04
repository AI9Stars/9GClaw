const NON_ASCII_PATTERN = /[^\u0020-\u007E]/u;
const RESERVED_NINEGCLAW_PATTERN =
  /(?:official[^a-z0-9]*(9gclaw|pilot)|(?:9gclaw|pilot)[^a-z0-9]*official|^(?:9gclaw|pilot)[^a-z0-9]*(marketplace|plugins|official))/iu;

export function validateMarketplaceName(name: string): string | undefined {
  if (!name || name.includes(" ") || name.includes("/") || name.includes("\\") || name.includes("..") || name === ".") {
    return "Marketplace name must be non-empty and must not contain spaces, path separators or traversal.";
  }
  if (name.toLowerCase() === "inline" || name.toLowerCase() === "builtin") {
    return `Marketplace name ${name} is reserved.`;
  }
  if (NON_ASCII_PATTERN.test(name) || RESERVED_NINEGCLAW_PATTERN.test(name)) {
    return "Marketplace name impersonates an official 9GClaw marketplace.";
  }
  return undefined;
}
