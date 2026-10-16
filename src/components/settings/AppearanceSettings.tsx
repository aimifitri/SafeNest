import { StyleSheet, Text, View } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import type { TextScale, ThemeMode, ThemeTokens } from "../shared/theme";

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const textOptions: { value: TextScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Medium" },
  { value: "large", label: "Large" },
];

export function AppearanceSettings() {
  const { theme, themeMode, setThemeMode, textScale, setTextScale } = useAppContext();
  const styles = makeStyles(theme);

  return (
    <>
      <SectionHeading title="Appearance" />
      <Card style={styles.card}>
        <Text style={styles.settingTitle}>Theme</Text>
        <Text style={styles.settingHint}>System follows your device appearance.</Text>
        <View style={styles.options}>
          {themeOptions.map((option) => (
            <View key={option.value} style={styles.option}>
              {themeMode === option.value ? (
                <PrimaryButton
                  label={option.label}
                  accessibilityLabel={`${option.label} theme, selected`}
                  onPress={() => setThemeMode(option.value)}
                />
              ) : (
                <SecondaryButton
                  label={option.label}
                  accessibilityLabel={`${option.label} theme`}
                  onPress={() => setThemeMode(option.value)}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.divider} />
        <Text style={styles.settingTitle}>Text size</Text>
        <Text style={styles.settingHint}>Changes the text across the app.</Text>
        <View style={styles.options}>
          {textOptions.map((option) => (
            <View key={option.value} style={styles.option}>
              {textScale === option.value ? (
                <PrimaryButton
                  label={option.label}
                  accessibilityLabel={`${option.label} text size, selected`}
                  onPress={() => setTextScale(option.value)}
                />
              ) : (
                <SecondaryButton
                  label={option.label}
                  accessibilityLabel={`${option.label} text size`}
                  onPress={() => setTextScale(option.value)}
                />
              )}
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  card: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, gap: theme.spacing.xs },
  settingTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  settingHint: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 3 },
  options: { flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  option: { flex: 1 },
  divider: { height: 1, backgroundColor: theme.colors.line, marginVertical: theme.spacing.xs },
});
