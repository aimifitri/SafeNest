import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { mockData } from "../shared/mockData";
import type { ThemeTokens } from "../shared/theme";

export function CaregiverProfileSection() {
  const { theme, selectedCaregiver } = useAppContext();
  const caregiver = selectedCaregiver ?? mockData.caregivers[0];
  const emergencyContact = mockData.caregivers.find((person) => person.id !== caregiver.id);
  const { child } = mockData;
  const styles = makeStyles(theme);

  return (
    <>
      <SectionHeading title="Caregiver profile" />
      <Card style={styles.card}>
        <View style={styles.profileTop}>
          <Avatar name={caregiver.name} size={60} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{caregiver.name}</Text>
            <Text style={styles.role}>{caregiver.role}{caregiver.isAdmin ? " · Admin" : ""}</Text>
            <Text style={styles.email}>{caregiver.email}</Text>
          </View>
        </View>
        <DetailRow label="Phone" value={caregiver.phone} />
        <Text style={styles.demoNote}>Fictional demo profile · Profile edits and account services are not connected.</Text>
      </Card>

      <SectionHeading title="Emergency contact" />
      <Card style={styles.card}>
        {emergencyContact ? (
          <>
            <View style={styles.profileTop}>
              <Avatar name={emergencyContact.name} size={46} />
              <View style={styles.profileInfo}>
                <Text style={styles.detailTitle}>{emergencyContact.name}</Text>
                <Text style={styles.detailSub}>{emergencyContact.role}</Text>
              </View>
            </View>
            <DetailRow label="Phone" value={emergencyContact.phone} />
            <DetailRow label="Email" value={emergencyContact.email} last />
          </>
        ) : (
          <Text style={styles.detailSub}>No emergency contact is listed in the demo profiles.</Text>
        )}
      </Card>

      <SectionHeading title="Linked family profile" />
      <Card style={styles.card}>
        <View style={styles.profileTop}>
          <Avatar name={child.name} size={46} />
          <View style={styles.profileInfo}>
            <Text style={styles.detailTitle}>{child.name}, age {child.age}</Text>
            <Text style={styles.detailSub}>Class {child.className}</Text>
          </View>
        </View>
        <Text style={styles.demoNote}>Linked family details use fictional demo data.</Text>
      </Card>
    </>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);

  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  card: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  profileTop: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  profileInfo: { flex: 1, minWidth: 0 },
  name: { color: theme.colors.ink, fontSize: 20 * theme.textScale, fontWeight: "800" },
  role: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "700", marginTop: 3 },
  email: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 4 },
  detailTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  detailSub: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 3 },
  detailRow: { paddingTop: theme.spacing.sm, gap: 3 },
  detailRowLast: { paddingBottom: 0 },
  detailLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale },
  detailValue: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "600", lineHeight: 20 * theme.textScale },
  demoNote: { color: theme.colors.muted, fontSize: 10 * theme.textScale, lineHeight: 15 * theme.textScale, marginTop: theme.spacing.sm },
});
