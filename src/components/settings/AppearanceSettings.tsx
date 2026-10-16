import { View } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Seg, T } from "../shared/ui";
import type { TextScale, ThemeMode } from "../shared/theme";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const textOptions: { value: TextScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "extraLarge", label: "Extra large" },
];

export function AppearanceSettings() {
  const { theme, themeMode, setThemeMode, textScale, setTextScale } = useAppContext();

  return (
    <>
      <SectionHeading title="Appearance" />
      <Card style={{ gap: 6 }}>
        <T w={800}>Theme</T>
        <T s={0.88} c="muted" lh={1.4}>System follows your device appearance.</T>
        <View style={{ marginTop: 6 }}>
          <Seg<ThemeMode>
            cur={themeMode}
            onPick={setThemeMode}
            opts={themeOptions.map((option) => ({
              value: option.value,
              label: option.label,
              a11y: themeMode === option.value ? `${option.label} theme, selected` : `${option.label} theme`,
            }))}
          />
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.line, marginVertical: 12 }} />
        <T w={800}>Text size</T>
        <T s={0.88} c="muted" lh={1.4}>Changes the text across the app.</T>
        <View style={{ marginTop: 6 }}>
          <Seg<TextScale>
            cur={textScale}
            onPick={setTextScale}
            opts={textOptions.map((option) => ({
              value: option.value,
              label: option.label,
              a11y: textScale === option.value ? `${option.label} text size, selected` : `${option.label} text size`,
            }))}
          />
        </View>
      </Card>
    </>
  );
}
