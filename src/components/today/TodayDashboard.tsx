import { Link } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { ThemeTokens } from "../shared/theme";

export function TodayDashboard() {
  const { theme, selectedCaregiver, temporaryDismissal, trustedHelpers, backupRequest, requestBackupPickup } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { child, school, familyMembers, pickupStatus, schedule } = mockData;
  const scheduledCollector = [...familyMembers, ...trustedHelpers].find((person) => person.id === pickupStatus.collectorId);
  const caregiver = selectedCaregiver?.name ?? "Abu";
  const weekday = new Date().getDay();
  const weekdayKey = (weekday === 0 ? 1 : Math.min(weekday, 5)) as 1 | 2 | 3 | 4 | 5;
  const originalDismissal = schedule.weekdayTimes[weekdayKey] ?? "1:00 PM";
  const dismissal = temporaryDismissal?.weekday === weekdayKey ? temporaryDismissal.time : originalDismissal;
  const changedToday = temporaryDismissal?.weekday === weekdayKey;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const backupHelper = trustedHelpers.find((helper) => helper.id === backupRequest.helperId);
  const collector = backupRequest.state === "accepted" ? backupHelper ?? scheduledCollector : scheduledCollector;
  const status = pickupStatus.state;
  const isLate = status === "late" && backupRequest.state !== "accepted";
  const atSchool = pickupStatus.currentPlace === "school";
  const onRoad = pickupStatus.currentPlace === "road";
  const isCovered = status === "covered" || backupRequest.state === "accepted";
  const isArrived = status === "arrived";
  const statusLabel = isLate ? "Pickup may be late" : isArrived ? "Pickup journey complete" : isCovered ? "Backup pickup covered" : atSchool ? "Waiting at school" : onRoad ? "On the way" : status === "planned" ? "Pickup planned" : "On track";
  const tone = isLate ? "warning" : isCovered || isArrived ? "success" : "info";
  const journeyText = isArrived
    ? `The pickup journey with ${collector?.name ?? "the collector"} is marked complete in this demo.`
    : isCovered
      ? `${collector?.name ?? "A trusted helper"} accepted the backup pickup request.`
      : atSchool
        ? `${child.name} is waiting at school for ${collector?.name ?? "the collector"}.`
        : onRoad
          ? `${collector?.name ?? "The collector"} is on the way. Estimated arrival in ${pickupStatus.etaMinutes} min.`
          : isLate
            ? `The collector may arrive after dismissal. Estimated arrival in ${pickupStatus.etaMinutes} min.`
            : `The collector is preparing to leave. Estimated arrival in ${pickupStatus.etaMinutes} min.`;
  const canRequestBackup = backupRequest.state === "idle" || backupRequest.state === "declined";
  const requestBackup = () => {
    const helper = trustedHelpers.find((candidate) => candidate.state === "active");
    requestBackupPickup(helper?.id);
  };
  const backupMessage = backupRequest.state === "requested"
    ? `Waiting for a simulated response${backupHelper ? ` from ${backupHelper.name}` : ""}.`
    : backupRequest.state === "accepted"
      ? `${backupHelper?.name ?? "A trusted helper"} accepted in this demo.`
      : backupRequest.state === "declined"
        ? `${backupHelper?.name ?? "The helper"} declined in this demo. You can request another helper from Plan.`
        : `No family member was notified.`;

  return (
    <AppShell title="SafeNest" badge="Today" activeTab="home">
      <View style={styles.mapWrap} accessible accessibilityRole="image" accessibilityLabel="Illustrated simulated map showing the school and pickup route">
        <View style={styles.mapTop}>
          <View style={styles.mapBrand}><Text style={styles.brandMark}>S</Text><Text style={styles.brandText}>SafeNest</Text></View>
          <View style={styles.demoTag}><View style={styles.demoDot} /><Text style={styles.demoText}>DEMO MAP</Text></View>
        </View>
        <View style={styles.mapScene}>
          <View style={[styles.park, styles.parkOne]} /><View style={[styles.park, styles.parkTwo]} />
          <View style={[styles.road, styles.roadHorizontal]} /><View style={[styles.road, styles.roadVertical]} />
          <View style={[styles.road, styles.roadDiagonal]} />
          <View style={styles.routeLine} />
          <View style={styles.schoolPin}><Text style={styles.pinIcon}>⌂</Text></View>
          <View style={styles.carPin}><Text style={styles.carIcon}>●</Text></View>
          <Text style={[styles.mapLabel, styles.schoolLabel]}>SCHOOL</Text>
          <Text style={[styles.mapLabel, styles.neighborhoodLabel]}>TAMAN AMAN</Text>
          <View style={styles.mapLegend}><View style={styles.legendDot} /><Text style={styles.legendText}>Simulated route</Text></View>
        </View>
      </View>

      <View style={styles.greetingRow}>
        <View style={styles.greetingCopy}>
          <Text style={styles.hello}>{greeting}</Text>
          <Text style={styles.greetingName}>{caregiver}</Text>
        </View>
        <View style={styles.childChip}><Avatar name={child.name} size={36} /><View><Text style={styles.childChipName}>{child.name}</Text><Text style={styles.childChipMeta}>School ends {dismissal}</Text></View></View>
      </View>

      {schedule.changedToday ? (
        <Card variant="warning" style={styles.alertCard}>
          <Text style={styles.alertTitle}>Pickup time changed to {schedule.changedToday.time}</Text>
          <Text style={styles.alertBody}>{schedule.changedToday.reason} · Updated by {schedule.changedToday.changedBy}</Text>
        </Card>
      ) : null}
      {changedToday ? (
        <Card variant="warning" style={styles.alertCard}>
          <Text style={styles.alertTitle}>Dismissal temporarily changed to {dismissal}</Text>
          <Text style={styles.alertBody}>This one-day demo change can be reset from the Pickup Plan.</Text>
        </Card>
      ) : null}
      {backupRequest.state !== "idle" ? (
        <Card variant="warning" style={styles.alertCard}>
          <Text style={styles.alertTitle}>Backup pickup · {backupRequest.state}</Text>
          <Text style={styles.alertBody}>{backupMessage}</Text>
        </Card>
      ) : null}

      <SectionHeading title="Today’s pickup" />
      <Card variant={isLate ? "warning" : "hero"} style={styles.pickupCard}>
        <View style={styles.cardTop}><Text style={[styles.eyebrow, !isLate && styles.heroMuted]}>PICKUP JOURNEY</Text><StatusPill label={statusLabel} tone={tone} /></View>
        <Text style={[styles.pickupTitle, !isLate && styles.heroText]}>{child.name}’s pickup</Text>
        <Text style={[styles.schoolName, !isLate && styles.heroMuted]}>{school.name}</Text>
        <Text style={[styles.address, !isLate && styles.heroMuted]}>{school.address}</Text>

        <View style={[styles.journeyBox, !isLate && styles.journeyBoxDark]}>
          <View style={styles.journeyIcon}><Text style={styles.journeyIconText}>{atSchool ? "⌂" : onRoad ? "↗" : "●"}</Text></View>
          <View style={styles.journeyCopy}><Text style={[styles.journeyTitle, !isLate && styles.heroText]}>{isArrived ? "Journey complete" : isCovered ? "Backup arranged" : atSchool ? "At school" : onRoad ? "On the way" : isLate ? "Pickup delayed" : "Pickup plan"}</Text><Text style={[styles.journeyBody, !isLate && styles.heroMuted]}>{journeyText}</Text></View>
        </View>

        <View style={[styles.statsRow, !isLate && styles.statsBorder]}>
          <View style={styles.stat}><Text style={[styles.statLabel, !isLate && styles.heroMuted]}>SCHOOL ENDS</Text><Text style={[styles.statValue, !isLate && styles.heroText]}>{dismissal}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={[styles.statLabel, !isLate && styles.heroMuted]}>ETA</Text><Text style={[styles.statValue, !isLate && styles.heroText]}>{isArrived ? "Complete" : isCovered ? "Covered" : atSchool ? "Waiting" : `${pickupStatus.etaMinutes} min`}</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={[styles.statLabel, !isLate && styles.heroMuted]}>COLLECTOR</Text><Text style={[styles.statValue, !isLate && styles.heroText]}>{collector?.name ?? "Not set"}</Text></View>
        </View>
        <Text style={[styles.simulatedNote, !isLate && styles.heroMuted]}>Demo only · Location and journey status are simulated</Text>
        <PrimaryButton label={backupRequest.state === "requested" ? "Waiting for response" : backupRequest.state === "accepted" ? "Backup pickup accepted" : canRequestBackup ? "Request backup pickup" : "Backup response received"} disabled={!canRequestBackup || trustedHelpers.every((helper) => helper.state !== "active")} onPress={requestBackup} />
        <Link href="/plan" asChild><Pressable accessibilityRole="button" style={styles.journeyLink}><Text style={[styles.journeyLinkText, !isLate && styles.heroButtonText]}>View pickup plan  →</Text></Pressable></Link>
      </Card>

      <View style={styles.schoolRow}>
        <Text style={styles.schoolRowIcon}>⌂</Text><View style={styles.schoolRowCopy}><Text style={styles.schoolRowTitle}>{child.name} · Class {child.className}</Text><Text style={styles.schoolRowMeta}>{school.name} · Dismissal {dismissal}</Text></View>
      </View>
      <Link href="/circle" asChild><Pressable accessibilityRole="button" style={styles.circleLink}><Text style={styles.circleLinkText}>See trusted circle</Text></Pressable></Link>
    </AppShell>
  );
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  mapWrap: { height: 210, borderRadius: 24, overflow: "hidden", backgroundColor: theme.colors.map, marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg },
  mapTop: { position: "absolute", zIndex: 2, top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapBrand: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: theme.colors.card, padding: 7, paddingRight: 11, borderRadius: 18 },
  brandMark: { width: 25, height: 25, borderRadius: 9, overflow: "hidden", textAlign: "center", textAlignVertical: "center", backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, fontWeight: "900" },
  brandText: { color: theme.colors.ink, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  demoTag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: theme.colors.card, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  demoDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  demoText: { color: theme.colors.muted, fontSize: 9 * theme.textScale, fontWeight: "800", letterSpacing: 0.6 },
  mapScene: { flex: 1, overflow: "hidden" },
  park: { position: "absolute", backgroundColor: theme.colors.park, borderRadius: 20 },
  parkOne: { width: 96, height: 54, left: -14, top: 61, transform: [{ rotate: "-18deg" }] },
  parkTwo: { width: 90, height: 52, right: -9, bottom: 9, transform: [{ rotate: "15deg" }] },
  road: { position: "absolute", backgroundColor: theme.colors.road, borderColor: theme.colors.line, borderWidth: 1, borderRadius: 20 },
  roadHorizontal: { height: 31, left: -15, right: -15, top: 101, transform: [{ rotate: "-5deg" }] },
  roadVertical: { width: 30, top: 27, bottom: -15, left: "56%", transform: [{ rotate: "18deg" }] },
  roadDiagonal: { width: "95%", height: 18, left: "17%", top: 42, transform: [{ rotate: "29deg" }] },
  routeLine: { position: "absolute", left: "34%", top: 76, width: "37%", height: 5, borderRadius: 4, backgroundColor: theme.colors.trail, transform: [{ rotate: "-20deg" }] },
  schoolPin: { position: "absolute", left: "26%", top: 54, width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primary, borderWidth: 3, borderColor: theme.colors.card, alignItems: "center", justifyContent: "center" },
  pinIcon: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: "800" },
  carPin: { position: "absolute", left: "65%", top: 96, width: 25, height: 25, borderRadius: 13, backgroundColor: theme.colors.card, borderWidth: 2, borderColor: theme.colors.trail, alignItems: "center", justifyContent: "center" },
  carIcon: { color: theme.colors.trail, fontSize: 13 },
  mapLabel: { position: "absolute", color: theme.colors.muted, fontSize: 9 * theme.textScale, fontWeight: "800", letterSpacing: 0.5 },
  schoolLabel: { left: "20%", top: 92 }, neighborhoodLabel: { right: 18, top: 72 },
  mapLegend: { position: "absolute", bottom: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: theme.colors.card },
  legendDot: { height: 7, width: 7, borderRadius: 4, backgroundColor: theme.colors.trail },
  legendText: { color: theme.colors.muted, fontSize: 10 * theme.textScale, fontWeight: "600" },
  greetingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.lg },
  greetingCopy: { flex: 1 }, hello: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale },
  greetingName: { color: theme.colors.ink, fontSize: 25 * theme.textScale, fontWeight: "800", marginTop: 1 },
  childChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.line, borderRadius: 18, padding: 7 },
  childChipName: { color: theme.colors.ink, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  childChipMeta: { color: theme.colors.muted, fontSize: 9 * theme.textScale, marginTop: 2 },
  alertCard: { marginBottom: theme.spacing.sm }, alertTitle: { color: theme.colors.warningInk, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  alertBody: { color: theme.colors.warningInk, fontSize: theme.type.small * theme.textScale, marginTop: 5 },
  pickupCard: { marginTop: theme.spacing.sm, padding: theme.spacing.lg },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  eyebrow: { color: theme.colors.muted, fontSize: 10 * theme.textScale, fontWeight: "800", letterSpacing: 1 },
  heroMuted: { color: theme.colors.heroMuted }, heroText: { color: "#FFFFFF" },
  pickupTitle: { color: theme.colors.ink, fontSize: 23 * theme.textScale, fontWeight: "800", marginTop: theme.spacing.md },
  schoolName: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700", marginTop: theme.spacing.xs },
  address: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 4, lineHeight: 17 * theme.textScale },
  journeyBox: { marginTop: theme.spacing.md, padding: theme.spacing.sm, borderRadius: 16, backgroundColor: theme.colors.background, flexDirection: "row", alignItems: "center", gap: 10 },
  journeyBoxDark: { backgroundColor: "rgba(255,255,255,0.08)" }, journeyIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  journeyIconText: { color: theme.colors.primaryInk, fontSize: 20, fontWeight: "800" }, journeyCopy: { flex: 1 },
  journeyTitle: { color: theme.colors.ink, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  journeyBody: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 3 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.line },
  statsBorder: { borderTopColor: "rgba(255,255,255,0.18)" }, stat: { flex: 1 }, statDivider: { width: 1, height: 28, backgroundColor: theme.colors.line, marginHorizontal: 7 },
  statLabel: { color: theme.colors.muted, fontSize: 8 * theme.textScale, fontWeight: "800", letterSpacing: 0.5 },
  statValue: { color: theme.colors.ink, fontSize: 12 * theme.textScale, fontWeight: "800", marginTop: 5 },
  simulatedNote: { color: theme.colors.muted, fontSize: 9 * theme.textScale, textAlign: "center", marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  journeyLink: { alignItems: "center", paddingVertical: theme.spacing.md }, journeyLinkText: { color: theme.colors.primaryInk, fontSize: theme.type.body * theme.textScale, fontWeight: "800" }, heroButtonText: { color: theme.colors.heroButton },
  schoolRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.lg },
  schoolRowIcon: { width: 38, height: 38, borderRadius: 13, textAlign: "center", textAlignVertical: "center", backgroundColor: theme.colors.primarySoft, color: theme.colors.primaryInk, fontSize: 20, fontWeight: "800" },
  schoolRowCopy: { flex: 1 }, schoolRowTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  schoolRowMeta: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 16 * theme.textScale, marginTop: 3 },
  circleLink: { minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.control, marginTop: theme.spacing.sm },
  circleLinkText: { color: theme.colors.primaryInk, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
});
