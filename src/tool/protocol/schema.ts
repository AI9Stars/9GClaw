export type NineGClawToolInputSchema = {
  type: "object";
  properties?: Record<string, NineGClawJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export type NineGClawJsonSchema = {
  type?: string | string[];
  properties?: Record<string, NineGClawJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: NineGClawJsonSchema;
  enum?: unknown[];
  [key: string]: unknown;
};

export type NineGClawToolValidationIssue = {
  path: string;
  code: "required" | "unknown_property" | "invalid_type" | "invalid_enum" | "invalid_schema";
  message: string;
};

export type NineGClawToolValidationResult =
  | { ok: true; input: unknown }
  | { ok: false; issues: NineGClawToolValidationIssue[] };
