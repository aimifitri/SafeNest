import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { mockData } from "../shared/mockData";
import type { ThemeTokens } from "../shared/theme";

const preferenceOptions = [
  {
    key: "pickup",
    label: "Pickup alerts",
    description: "A reminder before school pickup time.",
  },
  {
    key: "gate",
    label: "Gate status",
    description: `When ${mockData.child.name} is released for pickup.`,
  },
  {
    key: "delay",
    label: "Delay alerts",
    description: "When a pickup arrival time changes.",
  },
] as const;

type PreferenceKey = (typeof preferenceOptions)[number]["key"];
type Preferences = Record<PreferenceKey, boolean>;

export function SchoolPreferences() {
  const { theme } = useAppContext();
  const [preferences, setPreferences] = useState<Preferences>({
    pickup: true,
    gate: true,
    delay: true,
  });
  const styles = makeStyles(theme);

  function togglePreference(key: PreferenceKey) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <>
      <SectionHeading title="School preferences" />
      <Card style={styles.card}>
        {preferenceOptions.map((option, index) => {
          const enabled = preferences[option.key];

          return (
            <View key={option.key}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={option.label}
                accessibilityHint={option.description}
                accessibilityState={{ checked: enabled }}
                onPress={() => togglePreference(option.key)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.copy}>
                  <Text style={styles.label}>{option.label}</Text>
                  <Text style={styles.description}>{option.description}</Text>
                </View>
                <View style={[styles.track, enabled && styles.trackEnabled]}>
                  <View style={[styles.thumb, enabled && styles.thumbEnabled]} />
                </View>
              </Pressable>
            </View>
          );
        })}
        <Text style={styles.demoNote}>Preference switches are simulated in this demo; no notifications are sent.</Text>
      </Card>
    </>
  );
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  card: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.xs },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, padding: 10, borderRadius: theme.radius.control },
  copy: { flex: 1, minWidth: 0 },
  label: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  description: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 2 },
  track: { width: 52, height: 32, borderRadius: 16, backgroundColor: theme.colors.line, justifyContent: "center", padding: 3 },
  trackEnabled: { backgroundColor: theme.colors.primary },
  thumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF", shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  thumbEnabled: { transform: [{ translateX: 20 }] },
  separator: { height: 1, backgroundColor: theme.colors.line },
  demoNote: { color: theme.colors.muted, fontSize: 10 * theme.textScale, lineHeight: 15 * theme.textScale, marginHorizontal: 10, marginTop: theme.spacing.xs, marginBottom: theme.spacing.xs },
  pressed: { opacity: 0.78 },
});
