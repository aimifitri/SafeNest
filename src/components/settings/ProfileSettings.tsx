import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { ThemeTokens } from "../shared/theme";
import { AppearanceSettings } from "./AppearanceSettings";
import { CaregiverProfileSection } from "./CaregiverProfileSection";
import { SchoolPreferences } from "./SchoolPreferences";

export function ProfileSettings() {
  const { theme, trustedHelpers, clearCaregiver } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { child, school, caregivers, familyMembers } = mockData;
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  return (
    <AppShell title="Settings" badge="Profile" activeTab="settings">
      <Text style={styles.lead}>Your profile, family details and app preferences.</Text>

      <CaregiverProfileSection />
      <AppearanceSettings />
      <SchoolPreferences />

      <SectionHeading title="Family and school" />
      <Card style={styles.card}>
        <View style={styles.detailHeader}>
          <Avatar name={child.name} size={46} />
          <View style={styles.flex}>
            <Text style={styles.detailTitle}>{child.name}, age {child.age}</Text>
            <Text style={styles.detailSub}>Class {child.className}</Text>
          </View>
          <StatusPill label="Child" tone="info" />
        </View>
        <View style={styles.divider} />
        <DetailRow label="School" value={school.name} />
        <DetailRow label="Address" value={school.address} />
        <DetailRow label="Class teacher" value={school.teacher} />
        <DetailRow label="Teacher phone" value={school.teacherPhone} last />
      </Card>

      <SectionHeading title="Family circle" />
      <Card style={styles.card}>
        <View style={styles.countRow}>
          <Text style={styles.countLabel}>Caregivers</Text>
          <Text style={styles.countValue}>{caregivers.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.countRow}>
          <Text style={styles.countLabel}>Family members</Text>
          <Text style={styles.countValue}>{familyMembers.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.countRow}>
          <Text style={styles.countLabel}>Approved pickup helpers</Text>
          <Text style={styles.countValue}>{approvedHelpers}</Text>
        </View>
        <Text style={styles.demoNote}>Counts use the current sample data. Pending helpers are not included.</Text>
      </Card>

      <SectionHeading title="Other settings" />
      <Card style={styles.card}>
        <SettingRow title="Pickup notifications" subtitle="Notification controls are simulated in this demo." />
        <View style={styles.divider} />
        <SettingRow title="Privacy and location" subtitle="Location shown elsewhere in the app is simulated." last />
      </Card>
      <SecondaryButton label="Switch profile" onPress={clearCaregiver} />
      <Text style={styles.demoNote}>Returns to the demo profile selector. No account session is ended.</Text>
      <Text style={styles.footer}>Settings are held in app memory for this session only.</Text>
    </AppShell>
  );

  function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
    return (
      <View style={[styles.detailRow, last && styles.detailRowLast]}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  }

  function SettingRow({ title, subtitle, last = false }: { title: string; subtitle: string; last?: boolean }) {
    return (
      <View style={[styles.settingRow, last && styles.settingRowLast]}>
        <View style={styles.flex}>
          <Text style={styles.settingRowTitle}>{title}</Text>
          <Text style={styles.settingHint}>{subtitle}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    );
  }
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  lead: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, lineHeight: 21 * theme.textScale, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  card: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  detailTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  detailSub: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 3 },
  divider: { height: 1, backgroundColor: theme.colors.line, marginVertical: theme.spacing.xs },
  detailRow: { paddingVertical: theme.spacing.xs, gap: 3 },
  detailRowLast: { paddingBottom: 0 },
  detailLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale },
  detailValue: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "600", lineHeight: 20 * theme.textScale },
  countRow: { minHeight: 35, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countLabel: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale },
  countValue: { color: theme.colors.primaryInk, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  demoNote: { color: theme.colors.muted, fontSize: 10 * theme.textScale, lineHeight: 15 * theme.textScale, marginTop: theme.spacing.sm },
  settingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  settingRowLast: { paddingBottom: 0 },
  settingRowTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  settingHint: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 3 },
  chevron: { color: theme.colors.muted, fontSize: 25 },
  footer: { color: theme.colors.muted, fontSize: 10 * theme.textScale, textAlign: "center", marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
});
