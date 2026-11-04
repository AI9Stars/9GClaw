import type { NineGClawToolValidationIssue } from "../protocol/schema.js";

export type FormatValidationErrorOptions = {
  maxOutputTokens?: number;
  outputTruncated?: boolean;
};

/**
 * Format validation issues into a human-readable (and LLM-friendly) error
 * message. Formats missing, mistyped, and unexpected parameters so the
 * model sees exactly which parameters are missing, have the wrong type, or
 * are unexpected — enabling effective self-correction on the next turn.
 */
export function formatValidationError(
  toolName: string,
  issues: NineGClawToolValidationIssue[],
  options?: FormatValidationErrorOptions,
): string {
  const errorParts: string[] = [];

  for (const issue of issues) {
    const param = issue.path.replace(/^\$\.?/, "");
    switch (issue.code) {
      case "required":
        errorParts.push(`The required parameter \`${param}\` is missing`);
        break;
      case "invalid_type":
        errorParts.push(`The parameter \`${param}\` has an invalid type: ${issue.message}`);
        break;
      case "unknown_property":
        errorParts.push(`An unexpected parameter \`${param}\` was provided`);
        break;
      case "invalid_enum":
        errorParts.push(`The parameter \`${param}\` has an invalid value: ${issue.message}`);
        break;
      default:
        errorParts.push(issue.message);
        break;
    }
  }

  if (errorParts.length === 0) {
    return `Tool ${toolName} input is invalid.`;
  }

  const label = errorParts.length > 1 ? "issues" : "issue";
  let message = `${toolName} failed due to the following ${label}:\n${errorParts.join("\n")}`;

  const FILE_TOOLS = new Set(["write_file", "edit_file", "edit_notebook", "bash"]);
  const hasRequiredMissing = issues.some((i) => i.code === "required");
  const tokenBudget = options?.maxOutputTokens;
  const tokenInfo = tokenBudget ? ` (current max_output_tokens: ${tokenBudget})` : "";

  if (hasRequiredMissing && FILE_TOOLS.has(toolName)) {
    if (options?.outputTruncated) {
      message += `\n\nThis was caused by your output being truncated (output token limit reached${tokenInfo}). `
        + "Keep each tool call's arguments well within the output token budget.";
    } else {
      message += "\n\nPlease ensure all required parameters are provided in the tool call.";
    }
  }

  if (
    toolName === "write_file" &&
    issues.some((i) => i.code === "required" && i.path.includes("content"))
  ) {
    message +=
      "\n\nHint: For large files, recover by creating a smaller but valid draft workspace file first. "
      + "Use write_file with a complete content field that fits comfortably within the output budget. "
      + "After the draft exists, read it with read_file and extend or patch it using small focused write_file/edit_file calls. "
      + "Do not use shell heredocs or paths outside the workspace.";
  }

  return message;
}
