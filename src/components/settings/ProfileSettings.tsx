import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import { textScaleValues } from "../shared/theme";
import type { TextScale, ThemeMode, ThemeTokens } from "../shared/theme";

const themeOptions: { value: ThemeMode; label: string; detail: string }[] = [
  { value: "system", label: "System", detail: "Follows your device" },
  { value: "light", label: "Light", detail: "Bright appearance" },
  { value: "dark", label: "Dark", detail: "Dim appearance" },
];

const textOptions: { value: TextScale; label: string; sample: string }[] = [
  { value: "small", label: "Small", sample: "Aa" },
  { value: "default", label: "Normal", sample: "Aa" },
  { value: "large", label: "Large", sample: "Aa" },
  { value: "extraLarge", label: "Extra large", sample: "Aa" },
];

export function ProfileSettings() {
  const { theme, selectedCaregiver, themeMode, setThemeMode, textScale, setTextScale } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const caregiver = selectedCaregiver ?? mockData.caregivers[0];
  const { child, school, caregivers, familyMembers, trustedHelpers } = mockData;
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  return (
    <AppShell title="Settings" badge="Profile" activeTab="settings">
      <Text style={styles.lead}>Your profile, family details and app preferences.</Text>

      <SectionHeading title="Caregiver profile" />
      <Card style={styles.profileCard}>
        <View style={styles.profileTop}>
          <Avatar name={caregiver.name} size={60} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{caregiver.name}</Text>
            <Text style={styles.role}>{caregiver.role}{caregiver.isAdmin ? " · Admin" : ""}</Text>
            <Text style={styles.email}>{caregiver.email}</Text>
          </View>
          <StatusPill label="Selected" tone="success" />
        </View>
        <View style={styles.phoneRow}><Text style={styles.metaLabel}>Phone</Text><Text style={styles.metaValue}>{caregiver.phone}</Text></View>
        <Text style={styles.demoNote}>Fictional demo profile · Profile edits and account services are not connected.</Text>
      </Card>

      <SectionHeading title="Family and school" />
      <Card style={styles.detailsCard}>
        <View style={styles.detailHeader}>
          <Avatar name={child.name} size={46} />
          <View style={styles.flex}><Text style={styles.detailTitle}>{child.name}, age {child.age}</Text><Text style={styles.detailSub}>Class {child.className}</Text></View>
          <StatusPill label="Child" tone="info" />
        </View>
        <View style={styles.divider} />
        <DetailRow label="School" value={school.name} />
        <DetailRow label="Address" value={school.address} />
        <DetailRow label="Class teacher" value={school.teacher} />
        <DetailRow label="Teacher phone" value={school.teacherPhone} last />
      </Card>

      <SectionHeading title="Family circle" />
      <Card style={styles.familyCard}>
        <View style={styles.countRow}><Text style={styles.countLabel}>Caregivers</Text><Text style={styles.countValue}>{caregivers.length}</Text></View>
        <View style={styles.divider} />
        <View style={styles.countRow}><Text style={styles.countLabel}>Family members</Text><Text style={styles.countValue}>{familyMembers.length}</Text></View>
        <View style={styles.divider} />
        <View style={styles.countRow}><Text style={styles.countLabel}>Approved pickup helpers</Text><Text style={styles.countValue}>{approvedHelpers}</Text></View>
        <Text style={styles.demoNote}>Counts use the current sample data. Pending helpers are not included.</Text>
      </Card>

      <SectionHeading title="Appearance" />
      <Card style={styles.appearanceCard}>
        <Text style={styles.settingTitle}>Theme</Text>
        <Text style={styles.settingHint}>System follows your device appearance.</Text>
        <View accessibilityRole="radiogroup" style={styles.themeOptions}>
          {themeOptions.map((option) => {
            const selected = themeMode === option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setThemeMode(option.value)} style={({ pressed }) => [styles.themeOption, selected && styles.themeOptionSelected, pressed && styles.pressed]}>
              <View style={styles.optionHeader}><Text style={[styles.optionLabel, selected && styles.selectedText]}>{option.label}</Text>{selected ? <View style={styles.selectedMark}><Text style={styles.check}>✓</Text></View> : null}</View>
              <Text style={[styles.optionDetail, selected && styles.selectedText]}>{option.detail}</Text>
            </Pressable>;
          })}
        </View>

        <View style={styles.divider} />
        <Text style={styles.settingTitle}>Text size</Text>
        <Text style={styles.settingHint}>Changes the text across the app.</Text>
        <View accessibilityRole="radiogroup" style={styles.sizeOptions}>
          {textOptions.map((option) => {
            const selected = textScale === option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setTextScale(option.value)} style={({ pressed }) => [styles.sizeOption, selected && styles.sizeOptionSelected, pressed && styles.pressed]}>
              <Text style={[styles.sample, { fontSize: 18 * textScaleValues[option.value] }]}>{option.sample}</Text>
              <Text style={[styles.sizeLabel, selected && styles.selectedText]}>{option.label}</Text>
              {selected ? <View style={styles.sizeDot} /> : null}
            </Pressable>;
          })}
        </View>
        <Text style={styles.preview}>Preview: Pickup updates for {child.name}</Text>
      </Card>

      <SectionHeading title="Other settings" />
      <Card style={styles.otherCard}>
        <SettingRow title="Pickup notifications" subtitle="Notification controls are not connected in this demo." />
        <View style={styles.divider} />
        <SettingRow title="Privacy and location" subtitle="Location shown elsewhere in the app is simulated." last />
      </Card>
      <Text style={styles.footer}>Settings are held in app memory for this session only.</Text>
    </AppShell>
  );

  function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
    return <View style={[styles.detailRow, last && styles.detailRowLast]}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
  }

  function SettingRow({ title, subtitle, last = false }: { title: string; subtitle: string; last?: boolean }) {
    return <View style={[styles.settingRow, last && styles.settingRowLast]}><View style={styles.flex}><Text style={styles.settingRowTitle}>{title}</Text><Text style={styles.settingHint}>{subtitle}</Text></View><Text style={styles.chevron}>›</Text></View>;
  }
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  lead: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, lineHeight: 21 * theme.textScale, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  profileCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  profileTop: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  profileInfo: { flex: 1, minWidth: 0 }, name: { color: theme.colors.ink, fontSize: 20 * theme.textScale, fontWeight: "800" },
  role: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "700", marginTop: 3 },
  email: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 4 },
  phoneRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.line, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm },
  metaLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale }, metaValue: { color: theme.colors.ink, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
  demoNote: { color: theme.colors.muted, fontSize: 10 * theme.textScale, lineHeight: 15 * theme.textScale, marginTop: theme.spacing.sm },
  detailsCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md }, detailHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  flex: { flex: 1, minWidth: 0 }, detailTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  detailSub: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 3 }, divider: { height: 1, backgroundColor: theme.colors.line, marginVertical: theme.spacing.xs },
  detailRow: { paddingVertical: theme.spacing.xs, gap: 3 }, detailRowLast: { paddingBottom: 0 }, detailLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale },
  detailValue: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "600", lineHeight: 20 * theme.textScale },
  familyCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md }, countRow: { minHeight: 35, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countLabel: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale }, countValue: { color: theme.colors.primaryInk, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  appearanceCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, gap: theme.spacing.xs },
  settingTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" }, settingHint: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 3 },
  themeOptions: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  themeOption: { padding: theme.spacing.sm, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.background },
  themeOptionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  optionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionLabel: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  optionDetail: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 2 }, selectedText: { color: theme.colors.primaryInk },
  selectedMark: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  check: { color: theme.colors.onPrimary, fontSize: 12, fontWeight: "900" },
  sizeOptions: { flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  sizeOption: { flex: 1, minHeight: 73, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", paddingHorizontal: 3, gap: 3 },
  sizeOptionSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  sample: { color: theme.colors.ink, fontWeight: "800" }, sizeLabel: { color: theme.colors.muted, fontSize: 9 * theme.textScale, fontWeight: "700", textAlign: "center" },
  sizeDot: { position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  preview: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "600", marginTop: theme.spacing.xs },
  otherCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm }, settingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  settingRowLast: { paddingBottom: 0 }, settingRowTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" }, chevron: { color: theme.colors.muted, fontSize: 25 },
  pressed: { opacity: 0.78 }, footer: { color: theme.colors.muted, fontSize: 10 * theme.textScale, textAlign: "center", marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
});
