import React from "react";
import { Box, Text } from "ink";
import { pilotDeckDarkBlueTheme } from "./theme.js";

export function PilotDeckLogo({ tagline }: { tagline?: string } = {}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <CondensedLogo />
      {tagline ? (
        <Box marginTop={1}>
          <Text color={pilotDeckDarkBlueTheme.brandAccent} bold>
            {"↗  "}
          </Text>
          <Text color={pilotDeckDarkBlueTheme.subtle}>{tagline}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function CondensedLogo(): React.ReactNode {
  return (
    <Text>
      <Text color={pilotDeckDarkBlueTheme.brand} bold>
        九格
      </Text>
      <Text color={pilotDeckDarkBlueTheme.brandAccent} bold>
        智能体平台
      </Text>
      <Text color={pilotDeckDarkBlueTheme.brandAccent}> ↗</Text>
    </Text>
  );
}
