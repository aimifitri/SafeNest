import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { FamilyMember, TrustedHelper } from "../shared/types";
import type { ThemeTokens } from "../shared/theme";

export function TrustedCircle() {
  const { theme } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [approvedIds, setApprovedIds] = useState<string[]>(() => mockData.trustedHelpers.filter((helper) => helper.state === "active").map((helper) => helper.id));
  const [pendingIds, setPendingIds] = useState<string[]>(() => mockData.trustedHelpers.filter((helper) => helper.state === "pending").map((helper) => helper.id));
  const [notice, setNotice] = useState("");
  const approvedHelpers = mockData.trustedHelpers.filter((helper) => approvedIds.includes(helper.id));
  const pendingHelpers = mockData.trustedHelpers.filter((helper) => pendingIds.includes(helper.id));
  const familyMembers = mockData.familyMembers;

  const approve = (helper: TrustedHelper) => {
    setPendingIds((current) => current.filter((id) => id !== helper.id));
    setApprovedIds((current) => current.includes(helper.id) ? current : [...current, helper.id]);
    setNotice(`${helper.name} approved in this demo.`);
  };
  const reject = (helper: TrustedHelper) => {
    setPendingIds((current) => current.filter((id) => id !== helper.id));
    setNotice(`${helper.name} request declined in this demo.`);
  };

  return (
    <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
      <Text style={styles.lead}>Your family and approved helpers for school pickup.</Text>
      <View style={styles.demoNotice}>
        <View style={styles.demoDot} /><Text style={styles.demoText}>Demo contacts · Locations and availability are simulated</Text>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.actionNotice}>{notice}</Text> : null}

      <SectionHeading title="Family" />
      <Card style={styles.listCard}>
        {familyMembers.map((member, index) => renderMember(member, index, member.id === mockData.pickupStatus.collectorId))}
      </Card>

      <SectionHeading title="Trusted circle" />
      <Card style={styles.listCard}>
        {approvedHelpers.length ? approvedHelpers.map((helper, index) => renderMember(helper, index, helper.id === mockData.pickupStatus.collectorId)) : <Text style={styles.empty}>Nobody yet.</Text>}
      </Card>

      {pendingHelpers.length > 0 ? <>
        <SectionHeading title="Waiting for a parent" />
        <Card style={styles.listCard}>
          {pendingHelpers.map((helper, index) => <View key={helper.id}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <View style={styles.memberRow}>
              <Avatar name={helper.name} size={46} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{helper.name}</Text>
                <Text style={styles.memberMeta}>{helper.role} · Approval requested</Text>
                <Text style={styles.location}>{helper.locationLabel ?? "Availability not shared"}</Text>
              </View>
              <StatusPill label="Pending" tone="warning" />
            </View>
            <Text style={styles.parentNote}>A parent must approve this helper before pickup.</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => approve(helper)} style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}><Text style={styles.approveText}>Approve</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Reject ${helper.name}`} onPress={() => reject(helper)} style={({ pressed }) => [styles.rejectButton, pressed && styles.pressed]}><Text style={styles.rejectText}>Reject</Text></Pressable>
            </View>
          </View>)}
        </Card>
      </> : null}
      <Text style={styles.footerNote}>Approvals are saved only while this screen is open. No invitations or notifications are sent.</Text>
    </AppShell>
  );

  function renderMember(member: FamilyMember | TrustedHelper, index: number, isCollector: boolean) {
    const location = member.locationLabel;
    return <View key={member.id}>
      {index > 0 ? <View style={styles.separator} /> : null}
      <View style={styles.memberRow}>
        <Avatar name={member.name} size={46} />
        <View style={styles.memberInfo}>
          <View style={styles.nameLine}><Text style={styles.memberName}>{member.name}</Text>{isCollector ? <Text style={styles.collectorTag}>TODAY’S PICKUP</Text> : null}</View>
          <Text style={styles.memberMeta}>{member.role}</Text>
          <Text style={styles.location}>{location ?? "Location not shared"}</Text>
        </View>
        <StatusPill label={"state" in member ? "Approved" : "Family"} tone="success" />
      </View>
    </View>;
  }
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  lead: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, lineHeight: 21 * theme.textScale, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  demoNotice: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  demoText: { flex: 1, color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "600" },
  actionNotice: { color: theme.colors.success, fontSize: theme.type.small * theme.textScale, fontWeight: "700", marginBottom: theme.spacing.sm },
  listCard: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  memberRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  memberInfo: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  memberName: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  collectorTag: { color: theme.colors.primaryInk, backgroundColor: theme.colors.primarySoft, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 3, fontSize: 8 * theme.textScale, fontWeight: "800", letterSpacing: 0.3 },
  memberMeta: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 3 },
  location: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, marginTop: 3 },
  separator: { height: 1, backgroundColor: theme.colors.line },
  empty: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, paddingVertical: theme.spacing.md },
  parentNote: { color: theme.colors.warningInk, backgroundColor: theme.colors.warning, borderRadius: 12, padding: theme.spacing.sm, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginBottom: theme.spacing.sm },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  approveButton: { flex: 1, minHeight: 44, backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center" },
  approveText: { color: theme.colors.onPrimary, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  rejectButton: { minWidth: 92, minHeight: 44, borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.control, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.card },
  rejectText: { color: theme.colors.danger, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  footerNote: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, textAlign: "center", lineHeight: 16 * theme.textScale, marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
});
