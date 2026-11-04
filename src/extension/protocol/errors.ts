export type NineGClawExtensionError = {
  code: "extension_load_failed" | "extension_invalid";
  message: string;
};
