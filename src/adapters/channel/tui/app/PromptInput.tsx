import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { nineGClawDarkBlueTheme } from "./theme.js";

export function PromptInput({
  value,
  onChange,
  onSubmit,
  isRunning,
  focus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (value: string) => void;
  isRunning: boolean;
  focus: boolean;
}): React.ReactNode {
  return (
    <Box
      borderStyle="round"
      borderColor={isRunning || focus ? nineGClawDarkBlueTheme.brandAccent : nineGClawDarkBlueTheme.border}
      paddingX={1}
      flexDirection="row"
    >
      <Text color={nineGClawDarkBlueTheme.brandAccent}>{"> "}</Text>
      <Box flexGrow={1}>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Ask 九格智能体平台... (Tab focus · ⏎ expand · /help)"
          showCursor
          focus={focus}
        />
      </Box>
    </Box>
  );
}
