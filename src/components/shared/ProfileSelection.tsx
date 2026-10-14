import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "./Avatar";
import { Card } from "./Card";
import { PrimaryButton } from "./PrimaryButton";
import { SectionHeading } from "./SectionHeading";
import { useAppContext } from "./AppContext";
import { mockData } from "./mockData";
import type { ThemeTokens } from "./theme";

export function ProfileSelection() {
  const { theme, selectCaregiver } = useAppContext();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme, insets.top, insets.bottom);
  return <View style={styles.screen}>
    <View style={styles.content}>
      <Text style={styles.eyebrow}>SAFENEST · DEMO</Text>
      <Text accessibilityRole="header" style={styles.title}>Who’s using SafeNest?</Text>
      <Text style={styles.subtitle}>Choose a family profile to explore the pickup demo.</Text>
      <SectionHeading title="Family profiles" />
      {mockData.caregivers.map((caregiver) => <Card key={caregiver.id}>
        <View style={styles.profileRow}>
          <Avatar name={caregiver.name} size={52} />
          <View style={styles.profileText}>
            <Text style={styles.name}>{caregiver.name}</Text>
            <Text style={styles.role}>{caregiver.role}</Text>
          </View>
        </View>
        <PrimaryButton label={`Continue as ${caregiver.name}`} onPress={() => selectCaregiver(caregiver)} />
      </Card>)}
      <Text style={styles.simulated}>Demo profile selection only. No account is created or authenticated.</Text>
    </View>
  </View>;
}

const makeStyles = (theme: ThemeTokens, top: number, bottom: number) => StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.background, paddingTop: top, paddingBottom: bottom },
  content: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md },
  eyebrow: { color: theme.colors.primary, fontSize: theme.type.small * theme.textScale, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: theme.colors.ink, fontSize: theme.type.title * theme.textScale, fontWeight: "800" },
  subtitle: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale },
  profileRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.md },
  profileText: { flex: 1 },
  name: { color: theme.colors.ink, fontSize: 18 * theme.textScale, fontWeight: "800" },
  role: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, marginTop: theme.spacing.xxs },
  simulated: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, textAlign: "center", marginTop: theme.spacing.xs },
});
