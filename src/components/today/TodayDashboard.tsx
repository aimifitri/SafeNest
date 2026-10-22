import { Link } from "expo-router";
import { useState } from "react";
import { Image, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { AppShell } from "../shared/AppShell";
import { Card } from "../shared/Card";
import { clock } from "../shared/circleEngine";
import { sim } from "../shared/demoSim";
import type { MapDot } from "../shared/MapView";
import { MapView } from "../shared/MapView";
import { useAuth } from "../shared/AuthContext";
import { useChildSchool } from "../shared/HouseholdContext";
import { EmptyState } from "../shared/forms";
import { NextStepCard, SetupChecklist, useSetupActions } from "../onboarding/SetupChecklist";
import { Banner, Btn, Glass, Press, Rise, SIc, T, useColors } from "../shared/ui";
import { HelperAssignments } from "./HelperAssignments";
import { PickupBanner, usePickupBanner } from "./PickupBanner";
import { PickupStatusCard } from "./PickupStatusCard";
import { usePickupFlow } from "./usePickupFlow";
import { DemoSheet, FullMap } from "./DemoControls";
import { DeviceLocationModal } from "./DeviceLocation";

const LOGO = require("../../../assets/images/logo.png");

// Where each person's dot sits on the 400x320 illustrated map. The collector's dot follows pickupStatus.currentPlace.
const PLACE_XY: Record<string, [number, number]> = { office: [60, 250], road: [180, 165], school: [250, 112] };
const SCHOOL_XY: [number, number] = [252, 114];
const BASE_XY: Record<string, [number, number]> = {
  siti: [95, 75],
  aiman: [352, 100],
  ima: [40, 150],
  ahmad: [340, 170],
  abu: [200, 222],
  salmah: [30, 215],
};

export function TodayDashboard() {
  const { theme, selectedCaregiver, trustedHelpers } = useAppContext();
  const pf = usePickupFlow();
  const { flow, collector, dismissal } = pf;
  const { child, school, hasChild, household } = useChildSchool();
  const { profile } = useAuth();
  const goSetup = useSetupActions();
  const familyMembers = household.members.map((m) => ({ id: m.userId, name: m.name }));
  const caregiver = selectedCaregiver?.name ?? "";
  const hour = pf.simActive ? Math.floor(pf.nowMin / 60) : new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const [demoOpen, setDemoOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const readyHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;
  
  // Map dots (simulated map). The collector's dot follows the phase. In the demo a backup collector's marker moves
  // along the map while travelling (made-up progress, shown as simulated). In real mode nothing is tracked, so the
  // marker only jumps between "at home", "on the way" and "at school".
  const atSchoolPhases = ["at_school", "collected"];
  const place = flow.phase === "travelling" || flow.phase === "helper_assigned" ? "road" : atSchoolPhases.includes(flow.phase) ? "school" : "office";
  const collected = flow.phase === "collected";
  const helperCollector = collector.kind !== "parent";
  const travel = pf.simActive ? pf.demo.state.travel : null;
  const dots: MapDot[] = [...familyMembers, ...trustedHelpers.filter((helper) => helper.state === "active")].map((person) => {
    const isCollector = person.name === collector.name;
    const home = BASE_XY[person.id] ?? [200, 250];
    let xy: [number, number] = isCollector ? PLACE_XY[place] : home;
    if (isCollector && helperCollector) {
      if (flow.phase === "helper_assigned") xy = home;
      else if (flow.phase === "travelling") xy = travel === null ? PLACE_XY.road : [home[0] + (SCHOOL_XY[0] - home[0]) * travel, home[1] + (SCHOOL_XY[1] - home[1]) * travel];
      else if (atSchoolPhases.includes(flow.phase)) xy = SCHOOL_XY;
    }
    return { id: person.id, name: person.name, x: xy[0], y: xy[1], ring: isCollector && !collected, hidden: isCollector && collected };
  });
  const banner = usePickupBanner({ phase: flow.phase, collector: collector.name, childName: child.name, simulated: pf.simActive, whenLabel: `Picked up at ${clock(pf.nowMin)}` });
  const mapNote = flow.phase === "travelling" && pf.simActive ? "Simulated movement" : "Simulated map";

  // A real account with no child yet: no map, no sample people. Say what is missing and offer the next step.
  if (!hasChild && !household.demo) {
    const helper = profile?.accountType === "helper";
    return (
      <AppShell title="SafeNest" badge="Today" activeTab="home">
        <HelperAssignments />
        {household.error ? <Banner>{household.error}</Banner> : null}
        {!household.ready ? (
          <T c="muted">Loading...</T>
        ) : helper ? (
          <>
            <EmptyState icon="today" title="Nothing to collect right now" body="When a parent asks you to collect their child, the request shows up here. Set when you are available so you are only asked at good times.">
              <Btn onPress={() => goSetup("availability")} label="Set my availability">Set my availability</Btn>
            </EmptyState>
            <SetupChecklist title="Your setup" />
          </>
        ) : (
          <>
            <EmptyState icon="school" title="Add your first child" body="SafeNest plans school pickups around your child's school and finish time. Nothing is shown until you add them.">
              <Btn onPress={() => goSetup("child")} icon="plus" label="Add your first child">Add your first child</Btn>
            </EmptyState>
            <SetupChecklist />
          </>
        )}
      </AppShell>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <AppShell
      title="SafeNest"
      badge="Today"
      activeTab="home"
      header={<TodayMap dots={dots} trail={collected} note={mapNote} clockLabel={pf.simActive ? clock(pf.nowMin) : null} onDemo={() => setDemoOpen(true)} onExpand={() => setMapOpen(true)} onLocation={() => setLocationOpen(true)} />}
    >
      <HelperAssignments />

      <Rise i={0} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 8, columnGap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }}>
          <T s={0.85} c="muted">{greeting}</T>
          <T s={1.1} w={700} ls={-0.01}>{caregiver}</T>
        </View>
        <ChildChip name={child.name} dismissal={dismissal} />
      </Rise>

      {pf.simActive ? (
        <Rise i={1}>
          <View style={{ gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.primarySoft }}>
            <T s={0.9} w={700} c={theme.colors.primaryInk} lh={1.3}>Demo clock {clock(pf.nowMin)}. School ends {pf.dismissal}.</T>
            <T s={0.84} c={theme.colors.primaryInk} lh={1.4}>Simulated: time, location and answers. Nobody is contacted. Open Demo controls to move the clock.</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Btn kind="o" sm onPress={() => setDemoOpen(true)}>Demo controls</Btn>
              {pf.realMode ? <Btn kind="o" sm onPress={() => sim.setForced(false)}>Back to real state</Btn> : null}
            </View>
          </View>
        </Rise>
      ) : null}

      {pf.notice ? (
        <Rise i={1} kind="swap">
          <Banner>{pf.notice}</Banner>
        </Rise>
      ) : null}

      <PickupStatusCard pf={pf} childName={child.name} />

      <NextStepCard />

      <Rise i={2}>
        <Card tight>
          <NavRow first href="/plan" icon="plan" title="Pickup plan" sub={`${child.name} · ${school.name}`} />
          <NavRow href="/circle" icon="circle" title="Trusted circle" sub={`${readyHelpers} helper${readyHelpers === 1 ? "" : "s"} ready to collect`} />
        </Card>
      </Rise>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} pf={pf} />
      <FullMap visible={mapOpen} onClose={() => setMapOpen(false)} dots={dots} trail={collected} />
      <DeviceLocationModal visible={locationOpen} onClose={() => setLocationOpen(false)} />
    </AppShell>
    <PickupBanner note={banner.note} onDismiss={banner.dismiss} />
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
function TodayMap({ dots, trail, note, clockLabel, onDemo, onExpand, onLocation }: { dots: MapDot[]; trail: boolean; note: string; clockLabel: string | null; onDemo: () => void; onExpand: () => void; onLocation: () => void }) {
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
        {clockLabel ? (
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38 }}>
            <Icon name="clock" size={16} color={c.primaryInk} stroke={2} />
            <T s={0.85} w={800} c={c.primaryInk} tab>{clockLabel}</T>
          </Glass>
        ) : null}
        <Press onPress={onDemo} label="Open demo controls" hint="Preview simulated pickup situations" style={{ minHeight: 44, justifyContent: "center" }}>
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38 }}>
            <Icon name="sliders" size={16} color={c.primaryInk} stroke={2} />
            <T s={0.85} w={700} c={c.primaryInk}>Demo</T>
          </Glass>
        </Press>
      </View>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View pointerEvents="none">
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.trail }} />
            <T s={0.8} w={600} c="muted">{note}</T>
          </Glass>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Press onPress={onLocation} label="Open this phone's live location" style={{ minHeight: 44, justifyContent: "center" }}>
            <Glass style={{ height: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 }}>
              <Icon name="look" size={16} color={c.primaryInk} stroke={2} />
              <T s={0.78} w={700} c={c.primaryInk}>My GPS</T>
            </Glass>
          </Press>
          <Press onPress={onExpand} label="Open full screen simulated map" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Glass style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 }}>
              <Icon name="expand" size={18} color={c.primaryInk} stroke={2} />
            </Glass>
          </Press>
        </View>
      </View>
    </View>
  );
}

function ChildChip({ name, dismissal }: { name: string; dismissal: string | null }) {
  const c = useColors();
  return (
    <View style={{ flexShrink: 1, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 999 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <T s={0.8} w={700} c={c.primaryInk}>{name[0]}</T>
      </View>
      <View style={{ flexShrink: 1 }}>
        <T s={0.88} w={600} lh={1.25}>{dismissal ? `${name} · ends ${dismissal}` : name}</T>
      </View>
    </View>
  );
}

/** Warm banner for a one-off dismissal change or a backup request update. */
