import React from "react";
import { Box, Text } from "ink";
import { nineGClawDarkBlueTheme } from "./theme.js";

export function NineGClawLogo({ tagline }: { tagline?: string } = {}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <CondensedLogo />
      {tagline ? (
        <Box marginTop={1}>
          <Text color={nineGClawDarkBlueTheme.brandAccent} bold>
            {"↗  "}
          </Text>
          <Text color={nineGClawDarkBlueTheme.subtle}>{tagline}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function CondensedLogo(): React.ReactNode {
  return (
    <Text>
      <Text color={nineGClawDarkBlueTheme.brand} bold>
        九格
      </Text>
      <Text color={nineGClawDarkBlueTheme.brandAccent} bold>
        智能体平台
      </Text>
      <Text color={nineGClawDarkBlueTheme.brandAccent}> ↗</Text>
    </Text>
  );
}
