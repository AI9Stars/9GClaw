import { DEFAULT_UPLOAD_LIMITS } from '../../../src/gateway/dialog/UploadStore.js';

export function readUploadLimits(env = process.env) {
  const number = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  };
  return {
    maxFileBytes: number('NINEGCLAW_UPLOAD_MAX_FILE_BYTES', DEFAULT_UPLOAD_LIMITS.maxFileBytes),
    maxTaskBytes: number('NINEGCLAW_UPLOAD_MAX_TASK_BYTES', DEFAULT_UPLOAD_LIMITS.maxTaskBytes),
    // The multipart parser shared by chat uploads supports at most 500 files.
    maxFiles: Math.min(500, number('NINEGCLAW_UPLOAD_MAX_FILES', DEFAULT_UPLOAD_LIMITS.maxFiles)),
    maxConcurrentPerProject: number('NINEGCLAW_UPLOAD_MAX_CONCURRENT', DEFAULT_UPLOAD_LIMITS.maxConcurrentPerProject),
    retentionMs: number('NINEGCLAW_UPLOAD_RETENTION_MS', DEFAULT_UPLOAD_LIMITS.retentionMs),
  };
}
