import path from 'node:path';
import os from 'node:os';

export function computerUseDirectory(env = process.env) {
  if (env.NINEGCLAW_COMPUTER_USE_DIRECTORY) return path.resolve(env.NINEGCLAW_COMPUTER_USE_DIRECTORY);
  return path.join(path.resolve(env.NINEGCLAW_HOME || path.join(os.homedir(), '.9gclaw')), 'computer-use');
}

export function computerUseMcpConfigPath(env = process.env) {
  return env.NINEGCLAW_COMPUTER_USE_MCP_CONFIG || path.join(computerUseDirectory(env), 'mcp.json');
}
