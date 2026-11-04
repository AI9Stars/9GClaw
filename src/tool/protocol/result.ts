import type {
  CanonicalToolResultBlock,
  CanonicalToolResultContentBlock,
} from "../../model/index.js";
import type { NineGClawToolError } from "./errors.js";
import type { NineGClawToolResultContent, NineGClawToolSupplementalMessage } from "./types.js";

export type NineGClawToolSuccessResult = {
  type: "success";
  toolCallId: string;
  toolName: string;
  content: NineGClawToolResultContent[];
  supplementalMessages?: NineGClawToolSupplementalMessage[];
  data?: unknown;
  metadata?: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
};

export type NineGClawToolErrorResult = {
  type: "error";
  toolCallId: string;
  toolName: string;
  error: NineGClawToolError;
  content: NineGClawToolResultContent[];
  supplementalMessages?: NineGClawToolSupplementalMessage[];
  metadata?: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
};

export type NineGClawToolResult = NineGClawToolSuccessResult | NineGClawToolErrorResult;

export type NineGClawToolResultSizeMetadata = {
  truncated?: boolean;
  originalBytes?: number;
  returnedBytes?: number;
  persistedPath?: string;
};

const EMPTY_TOOL_OUTPUT = "Tool completed with no output.";

export function contentToText(content: NineGClawToolResultContent): string {
  switch (content.type) {
    case "text":
      return content.text;
    case "json":
      return JSON.stringify(content.value);
    case "image":
      return `[Image: ${content.mimeType}, ${content.data.length} base64 characters]`;
    case "pdf":
      return `[PDF: ${content.mimeType}, ${content.data.length} base64 characters${content.pages ? `, ${content.pages} pages` : ""}]`;
    case "file":
      return `[File: ${content.path}${content.mimeType ? `, ${content.mimeType}` : ""}${
        content.description ? `, ${content.description}` : ""
      }]`;
  }
}

export function toCanonicalToolResultBlock(result: NineGClawToolResult): CanonicalToolResultBlock {
  const contentBlocks = result.content.map(toCanonicalToolResultContentBlock);

  return {
    type: "tool_result",
    toolCallId: result.toolCallId,
    isError: result.type === "error" || undefined,
    content: contentBlocks.length > 0 ? contentBlocks : [{ type: "text", text: EMPTY_TOOL_OUTPUT }],
    raw: sanitizeToolResultRaw(result),
  };
}

function sanitizeToolResultRaw(result: NineGClawToolResult): unknown {
  return {
    ...result,
    content: result.content.map(sanitizeRawContent),
    ...(result.supplementalMessages
      ? {
          supplementalMessages: result.supplementalMessages.map((message) => ({
            ...message,
            content: message.content.map(sanitizeRawContent),
          })),
        }
      : {}),
  };
}

function sanitizeRawContent(content: NineGClawToolResultContent): unknown {
  const kind = (content as { type?: unknown }).type;
  if (kind === "image" || kind === "pdf" || kind === "audio") {
    const { data: _omitted, ...rest } = content as Record<string, unknown>;
    return rest;
  }

  return content;
}

function toCanonicalToolResultContentBlock(
  content: NineGClawToolResultContent,
): CanonicalToolResultContentBlock {
  if (content.type === "image") {
    return {
      type: "image",
      source: "base64",
      data: content.data,
      mimeType: content.mimeType,
      bytes: content.bytes,
      detail: content.detail,
    };
  }

  if (content.type === "pdf") {
    return {
      type: "pdf",
      source: "base64",
      data: content.data,
      mimeType: content.mimeType,
      bytes: content.bytes,
      pages: content.pages,
    };
  }

  return {
    type: "text",
    text: contentToText(content),
  };
}

export function estimateResultContentBytes(content: NineGClawToolResultContent[]): number {
  return content.reduce((total, item) => {
    switch (item.type) {
      case "image":
      case "pdf":
        return total + item.data.length;
      default:
        return total + Buffer.byteLength(contentToText(item), "utf8");
    }
  }, 0);
}

export function applyResultSizeLimit(
  content: NineGClawToolResultContent[],
  maxBytes: number | undefined,
): { content: NineGClawToolResultContent[]; metadata?: NineGClawToolResultSizeMetadata } {
  if (maxBytes === undefined || maxBytes < 0) {
    return { content };
  }

  if (content.some((item) => item.type === "image" || item.type === "pdf")) {
    return {
      content,
      metadata: {
        originalBytes: estimateResultContentBytes(content),
      },
    };
  }

  const originalBytes = estimateResultContentBytes(content);
  if (originalBytes <= maxBytes) {
    return { content };
  }

  const suffix = "\n[Tool output truncated: head and tail shown.]";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  const budget = Math.max(0, maxBytes - suffixBytes);
  const text = content.map(contentToText).join("\n");
  const truncatedText = headTailTruncateUtf8(text, budget) + suffix;
  const returnedBytes = Buffer.byteLength(truncatedText, "utf8");

  return {
    content: [{ type: "text", text: truncatedText }],
    metadata: {
      truncated: true,
      originalBytes,
      returnedBytes,
    },
  };
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) {
    return value;
  }

  return bytes.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/u, "");
}

function headTailTruncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  if (maxBytes <= 64) {
    return truncateUtf8(value, maxBytes);
  }

  const separator = "\n... [middle omitted] ...\n";
  const separatorBytes = Buffer.byteLength(separator, "utf8");
  const contentBudget = Math.max(0, maxBytes - separatorBytes);
  const headBudget = Math.ceil(contentBudget / 2);
  const tailBudget = Math.floor(contentBudget / 2);
  const head = truncateUtf8(value, headBudget);
  const tail = truncateUtf8FromEnd(value, tailBudget);
  return `${head}${separator}${tail}`;
}

function truncateUtf8FromEnd(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) {
    return value;
  }

  let start = Math.max(0, bytes.byteLength - maxBytes);
  while (start < bytes.byteLength && (bytes[start] & 0b11000000) === 0b10000000) {
    start += 1;
  }
  return bytes.subarray(start).toString("utf8").replace(/^\uFFFD/u, "");
}
