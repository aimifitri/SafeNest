import { Link } from "expo-router";
import { useRef, useState } from "react";
import { Image, View, useWindowDimensions } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { MapView } from "../shared/MapView";
import type { MapDot } from "../shared/MapView";
import { StatusPill } from "../shared/StatusPill";
import { DemoSheet, FullMap } from "./DemoControls";
import { scenarios, useScenarioKey } from "../shared/demoScenario";
import { Btn, Glass, Press, Rise, SIc, T, useColors, useEffectiveScale, useTone } from "../shared/ui";
import { mockData } from "../shared/mockData";

const LOGO = require("../../../assets/images/logo.png");

// Where each person's dot sits on the 400x320 illustrated map. The collector's dot follows pickupStatus.currentPlace.
const PLACE_XY: Record<string, [number, number]> = { office: [60, 250], road: [180, 165], school: [250, 112] };
const BASE_XY: Record<string, [number, number]> = {
  siti: [95, 75],
  aiman: [352, 100],
  ima: [40, 150],
  ahmad: [340, 170],
  abu: [200, 222],
  salmah: [30, 215],
};

export function TodayDashboard() {
  const { theme, selectedCaregiver, weeklySchedule, temporaryDismissal, trustedHelpers, backupRequest, requestBackupPickup } = useAppContext();
  const { child, school, familyMembers, pickupStatus: basePickupStatus, schedule } = mockData;
  const scheduledCollector = [...familyMembers, ...trustedHelpers].find((person) => person.id === basePickupStatus.collectorId);
  const caregiver = selectedCaregiver?.name ?? "Abu";
  const weekday = new Date().getDay();
  const weekdayKey = (weekday === 0 ? 1 : Math.min(weekday, 5)) as 1 | 2 | 3 | 4 | 5;
  const originalDismissal = weeklySchedule[weekdayKey] ?? "1:00 PM";
  const dismissal = temporaryDismissal?.weekday === weekdayKey ? temporaryDismissal.time : originalDismissal;
  const changedToday = temporaryDismissal?.weekday === weekdayKey;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const backupHelper = trustedHelpers.find((helper) => helper.id === backupRequest.helperId);
  const collector = backupRequest.state === "accepted" ? backupHelper ?? scheduledCollector : scheduledCollector;
  const scenarioKey = useScenarioKey();
  const scenario = scenarios.find((s) => s.key === scenarioKey)?.value ?? null;
  const pickupStatus = scenario ? { ...basePickupStatus, ...scenario } : basePickupStatus;
  const [demoOpen, setDemoOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
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
  const collectorName = collector?.name ?? "The collector";
  const headline = isArrived
    ? `${child.name} has been collected`
    : isCovered
      ? `${collectorName} will collect ${child.name}`
      : atSchool
        ? `${child.name} is waiting for ${collectorName}`
        : `${collectorName} is collecting ${child.name}`;
  const nextStep = isArrived
    ? "Nothing more to do. The simulated journey is complete."
    : backupRequest.state === "requested"
      ? "Waiting for a helper to answer. You can check the Trusted Circle."
      : isCovered
        ? "Backup is arranged. You do not need to do anything else."
        : isLate
          ? `Pickup may be late. Ask an approved helper to collect ${child.name} instead.`
          : `If ${collectorName} cannot make it, ask an approved helper.`;
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


  // Map dots: everyone in the circle who is visible, with the collector moving by place.
  const dots: MapDot[] = [...familyMembers, ...trustedHelpers.filter((helper) => helper.state === "active")].map((person) => {
    const isCollector = person.id === collector?.id;
    const [x, y] = isCollector ? PLACE_XY[pickupStatus.currentPlace] : BASE_XY[person.id] ?? [200, 250];
    return { id: person.id, name: person.name, x, y, ring: isCollector && !isArrived, hidden: isCollector && isArrived };
  });

  // The status card cross-swaps whenever the situation changes (prototype: `.swap`).
  const sig = [statusLabel, backupRequest.state, dismissal, collector?.id].join("|");
  const firstSig = useRef(sig);
  const changed = useRef(false);
  if (firstSig.current !== sig) {
    firstSig.current = sig;
    changed.current = true;
  }

  // One notice at a time: the most urgent first. The hero card repeats a temporary change in its own subtitle.
  const notice =
    backupRequest.state !== "idle"
      ? {
          key: `b-${backupRequest.state}`,
          tone: (backupRequest.state === "accepted" ? "success" : backupRequest.state === "declined" ? "danger" : "info") as "success" | "danger" | "info",
          icon: backupRequest.state === "accepted" ? "check" : backupRequest.state === "declined" ? "x" : "clock",
          title: backupRequest.state === "requested" ? "Waiting for a helper" : backupRequest.state === "accepted" ? "Backup accepted" : "Backup declined",
          body: backupMessage,
        }
      : schedule.changedToday
        ? { key: "sched", tone: "warn" as const, icon: "bell", title: `Pickup time changed to ${schedule.changedToday.time}`, body: `${schedule.changedToday.reason} · Updated by ${schedule.changedToday.changedBy}` }
        : changedToday
          ? { key: "temp", tone: "warn" as const, icon: "clock", title: `Today only: school ends at ${dismissal}`, body: `Usually ${originalDismissal}. Reset it in Plan.` }
          : null;

  const readyHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  return (
    <AppShell
      title="SafeNest"
      badge="Today"
      activeTab="home"
      header={<TodayMap dots={dots} trail={isArrived} onDemo={() => setDemoOpen(true)} onExpand={() => setMapOpen(true)} />}
    >
      <Rise i={0} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 8, columnGap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }}>
          <T s={0.85} c="muted">{greeting}</T>
          <T s={1.1} w={700} ls={-0.01}>{caregiver}</T>
        </View>
        <ChildChip name={child.name} dismissal={dismissal} />
      </Rise>

      {notice ? (
        <Rise i={1} key={notice.key} kind="swap">
          <Alert tone={notice.tone} icon={notice.icon} title={notice.title} body={notice.body} />
        </Rise>
      ) : null}

      <Rise i={1} key={sig} kind={changed.current ? "swap" : "rise"}>
        <Card variant={isLate ? "warning" : "hero"}>
          <StatusPill label={statusLabel} tone={tone} />
          <View style={{ marginTop: 12 }}>
            <T s={1.5} w={800} ls={-0.025} lh={1.2}>{headline}</T>
          </View>
          <View style={{ marginTop: 6 }}>
            <T s={0.95} lh={1.4} c="muted">{journeyText}</T>
          </View>

          <Facts
            items={[
              { label: changedToday ? "School ends today" : "School ends", value: dismissal, note: changedToday ? `Usually ${originalDismissal}` : undefined },
              { label: isArrived ? "Pickup" : atSchool ? "Status" : "Arrives in", value: isArrived ? "Complete" : isCovered ? "Covered" : atSchool ? "At school" : `${pickupStatus.etaMinutes} min` },
            ]}
          />

          <View style={{ marginTop: 14 }}>
            <T s={0.9} lh={1.4} c="muted">{nextStep}</T>
          </View>
          <View style={{ marginTop: 12 }}>
            <Btn
              kind="p"
              icon="userplus"
              disabled={!canRequestBackup || trustedHelpers.every((helper) => helper.state !== "active")}
              onPress={requestBackup}
            >
              {backupRequest.state === "requested" ? "Waiting for response" : backupRequest.state === "accepted" ? "Backup accepted" : canRequestBackup ? "Ask a helper to collect" : "Response received"}
            </Btn>
          </View>
          <View style={{ marginTop: 10 }}>
            <T s={0.78} lh={1.35} c="muted" align="center">Simulated demo. Nobody is contacted.</T>
          </View>
        </Card>
      </Rise>

      <Rise i={2}>
        <Card tight>
          <NavRow first href="/plan" icon="plan" title="Pickup plan" sub={`${child.name} · ${school.name}`} />
          <NavRow href="/circle" icon="circle" title="Trusted circle" sub={`${readyHelpers} helper${readyHelpers === 1 ? "" : "s"} ready to collect`} />
        </Card>
      </Rise>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} />
      <FullMap visible={mapOpen} onClose={() => setMapOpen(false)} dots={dots} trail={isArrived} />
    </AppShell>
  );
}

/** Two key facts. Side by side when there is room, stacked rows when the card is narrow or text is large. */
function Facts({ items }: { items: Array<{ label: string; value: string; note?: string }> }) {
  const scale = useEffectiveScale();
  const [w, setW] = useState(0);
  const stacked = w > 0 && w / items.length < 150 * Math.max(1, scale);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: stacked ? "column" : "row", gap: 8, marginTop: 14 }}>
      {items.map((item) => (
        <Inset key={item.label} style={{ flex: stacked ? undefined : 1, minWidth: 0, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
          <T s={0.7} w={600} ls={0.02} up lh={1.3} style={{ opacity: 0.8 }}>{item.label}</T>
          <T s={1.3} w={800} tab lh={1.2}>{item.value}</T>
          {item.note ? <T s={0.78} lh={1.3} c="muted">{item.note}</T> : null}
        </Inset>
      ))}
    </View>
  );
}

function NavRow({ href, icon, title, sub, first }: { href: "/plan" | "/circle"; icon: string; title: string; sub: string; first?: boolean }) {
  const c = useColors();
  return (
    <Link href={href} asChild>
      <Press label={`${title}. ${sub}`} scaleTo={0.985} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
        <SIc name={icon} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700}>{title}</T>
          <T s={0.84} c="muted" lh={1.35}>{sub}</T>
        </View>
        <Icon name="chev" size={18} color={c.muted} stroke={2} />
      </Press>
    </Link>
  );
}

/** Full-bleed illustrated map with the frosted overlay chips. */
function TodayMap({ dots, trail, onDemo, onExpand }: { dots: MapDot[]; trail: boolean; onDemo: () => void; onExpand: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const h = Math.min(380, Math.max(240, winH * 0.4)) + insets.top;
  const topY = Math.max(12, insets.top + 8);
  return (
    <View style={{ height: h, backgroundColor: c.map, overflow: "hidden" }}>
      <MapView dots={dots} trail={trail} label="Illustrated simulated map showing the school and pickup route" />
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: topY, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Glass style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 }}>
          <Image source={LOGO} style={{ width: 30, height: 30, borderRadius: 15 }} />
          <T w={700} ls={-0.01}>SafeNest</T>
        </Glass>
        <Press onPress={onDemo} label="Open demo controls" hint="Preview simulated pickup situations" style={{ minHeight: 44, justifyContent: "center" }}>
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38 }}>
            <Icon name="sliders" size={16} color={c.primaryInk} stroke={2} />
            <T s={0.85} w={700} c={c.primaryInk}>Demo</T>
          </Glass>
        </Press>
      </View>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View pointerEvents="none">
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.trail }} />
            <T s={0.8} w={600} c="muted">Simulated map</T>
          </Glass>
        </View>
        <Press onPress={onExpand} label="Open full screen map" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Glass style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 }}>
            <Icon name="expand" size={18} color={c.primaryInk} stroke={2} />
          </Glass>
        </Press>
      </View>
    </View>
  );
}

function ChildChip({ name, dismissal }: { name: string; dismissal: string }) {
  const c = useColors();
  return (
    <View style={{ flexShrink: 1, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 999 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <T s={0.8} w={700} c={c.primaryInk}>{name[0]}</T>
      </View>
      <View style={{ flexShrink: 1 }}>
        <T s={0.88} w={600} lh={1.25}>{`${name} · ends ${dismissal}`}</T>
      </View>
    </View>
  );
}

/** Warm banner for a one-off dismissal change or a backup request update. */
function Alert({ title, body, tone = "warn", icon = "bell" }: { title: string; body: string; tone?: "warn" | "success" | "danger" | "info"; icon?: string }) {
  const c = useColors();
  const bg = tone === "success" ? c.successSoft : tone === "danger" ? c.dangerSoft : tone === "info" ? c.primarySoft : c.warning;
  const fg = tone === "success" ? c.success : tone === "danger" ? c.danger : tone === "info" ? c.primaryInk : c.warningInk;
  return (
    <Rise kind="swap" style={{ backgroundColor: bg, borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}><Icon name={icon} size={22} color={fg} stroke={2} /></View>
      <View style={{ flex: 1 }}>
        <T w={700} c={fg} lh={1.3}>{title}</T>
        <T s={0.92} c={fg} lh={1.4} style={{ opacity: 0.9 }}>{body}</T>
      </View>
    </Rise>
  );
}

/** Translucent panel inside the hero / warning card. */
function Inset({ style, children }: { style?: object; children: ReactNode }) {
  const tone = useTone();
  return <View style={[{ backgroundColor: tone === "warn" ? "rgba(94,75,0,.1)" : "rgba(255,255,255,.1)" }, style]}>{children}</View>;
}
