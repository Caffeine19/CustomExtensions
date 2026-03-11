import { useState } from "react";
import { ActionPanel, Action, Grid, closeMainWindow, showHUD } from "@raycast/api";
import { callHammerspoon } from "./utils/call-hammerspoon";

const COLUMNS = {
  LARGE: 4,
  SMALL: 6,
} as const;

type ColumnsValue = (typeof COLUMNS)[keyof typeof COLUMNS];

export default function Command() {
  const [columns, setColumns] = useState<ColumnsValue>(COLUMNS.SMALL);
  const [isLoading, setIsLoading] = useState(true);

  type Mode = { label: string; icon: string };

  const modeGroupList: Record<string, Mode[]> = {
    Focus: [
      { label: "Focus", icon: "player-icons/focus.svg" },
      { label: "Colored Noises", icon: "player-icons/colored-noises.svg" },
      { label: "Dynamic Focus", icon: "player-icons/dynamic-focus.svg" },
      { label: "Study", icon: "player-icons/study.svg" },
      { label: "Deeper Focus", icon: "player-icons/deeper-focus.svg" },

      // TODO need to add an icon
      // {
      //   label: "Solfeggio Tones",
      //   icon: "",
      // },
    ],
    Relax: [
      { label: "Relax", icon: "player-icons/relax.svg" },
      { label: "8D Odyssey", icon: "player-icons/8d-odyssey.svg" },
      { label: "Nature Elements", icon: "player-icons/nature-elements.svg" },
      { label: "Spatial Orbit", icon: "player-icons/spatial-orbit.svg" },
      { label: "Recovery", icon: "player-icons/recovery.svg" },
      { label: "Wiggly Wisdom", icon: "player-icons/wiggly-wisdom.svg" },
    ],
    Sleep: [
      { label: "Sleep", icon: "player-icons/sleep.svg" },
      { label: "Rainy Outside", icon: "player-icons/rainy-outside.svg" },
      { label: "Wind Down", icon: "player-icons/wind-down.svg" },
      { label: "Hibernation", icon: "player-icons/hibernation.svg" },
      { label: "AI Lullaby", icon: "player-icons/ai-lullaby.svg" },
    ],
  };

  const setMode = async (mode: string) => {
    callHammerspoon(`handleCallSetEndelMode("${mode}")`);
    closeMainWindow();
    showHUD("Endel mode set to " + mode);
  };

  return (
    <Grid
      columns={columns}
      inset={Grid.Inset.Large}
      isLoading={isLoading}
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Grid Item Size"
          storeValue
          onChange={(newValue) => {
            setColumns(Number(newValue) as ColumnsValue);
            setIsLoading(false);
          }}
        >
          <Grid.Dropdown.Item title="Large" value={COLUMNS.LARGE.toString()} />
          <Grid.Dropdown.Item title="Small" value={COLUMNS.SMALL.toString()} />
        </Grid.Dropdown>
      }
    >
      {!isLoading &&
        Object.entries(modeGroupList).map(([groupName, modes]) => (
          <Grid.Section key={groupName} title={groupName} subtitle={undefined}>
            {modes.map((mode) => (
              <Grid.Item
                key={mode.label}
                content={{ value: { source: mode.icon }, tooltip: mode.label }}
                title={mode.label}
                actions={
                  <ActionPanel>
                    <Action title={`Set ${mode.label}`} onAction={() => setMode(mode.label)} />
                  </ActionPanel>
                }
              />
            ))}
          </Grid.Section>
        ))}
    </Grid>
  );
}
