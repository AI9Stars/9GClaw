import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { TuiAppState } from "./types.js";
import { nineGClawDarkBlueTheme } from "./theme.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function ActivityLine({ state }: { state: TuiAppState }): React.ReactNode {
  const latest = state.activity.slice(0, 3);
  const [tick, setTick] = useState(0);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!state.isRunning) {
      setStartedAt(undefined);
      return;
    }
    setStartedAt(Date.now());
    const interval = setInterval(() => setTick((value) => value + 1), 100);
    return () => clearInterval(interval);
  }, [state.isRunning]);

  if (!state.isRunning && latest.length === 0) {
    return null;
  }

  const frame = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
  const elapsed = startedAt ? `${((Date.now() - startedAt) / 1000).toFixed(1)}s` : "0.0s";

  return (
    <Box paddingX={1}>
      {state.isRunning ? (
        <Text color={nineGClawDarkBlueTheme.brandAccent}>
          {frame} thinking <Text color={nineGClawDarkBlueTheme.subtle}>· {elapsed}</Text>{" "}
        </Text>
      ) : null}
      {latest.map((item) => (
        <Text key={item.id} color={colorForStatus(item.status)}>
          {item.text}{" "}
        </Text>
      ))}
    </Box>
  );
}

function colorForStatus(status: string): string {
  if (status === "done") return nineGClawDarkBlueTheme.success;
  if (status === "error") return nineGClawDarkBlueTheme.error;
  if (status === "running") return nineGClawDarkBlueTheme.brandAccent;
  return nineGClawDarkBlueTheme.subtle;
}
