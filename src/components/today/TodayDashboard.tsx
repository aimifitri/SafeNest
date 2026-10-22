import { Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, View, useWindowDimensions } from "react-native";
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
import { PickupEstimatePopup } from "./PickupEstimatePopup";

const LOGO = require("../../../assets/images/logo.png");
const PICKUP_WINDOW_BEFORE_MIN = 15;
const PICKUP_WINDOW_AFTER_MIN = 30;
const PICKUP_DISMISSED_STORAGE_PREFIX = "pickupDismissed";

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
  const { theme, selectedCaregiver, trustedHelpers, schoolLocation } = useAppContext();
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
  const [pickupPopupChildId, setPickupPopupChildId] = useState<string | null>(null);
  const [pickupPopupVisible, setPickupPopupVisible] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBanner, setBackupBanner] = useState<{ message: string; empty: boolean } | null>(null);
  const [circleScrollRequest, setCircleScrollRequest] = useState(0);
  const circleCardRef = useRef<View>(null);
  const dismissedPickupKeys = useRef(new Set<string>());
  const pendingGpsOpen = useRef(false);
  const pendingBackupRequest = useRef(false);
  const readyHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  const pickupDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    let active = true;
    let checking = false;
    const checkPickupTime = async () => {
      if (checking || locationOpen || pendingGpsOpen.current || !child) return;
      checking = true;
      try {
        const now = new Date();
        const currentMinute = pf.simActive
          ? pf.nowMin
          : now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const minutesFromPickup = currentMinute - pf.dismissMin;
        if (minutesFromPickup < -PICKUP_WINDOW_BEFORE_MIN || minutesFromPickup > PICKUP_WINDOW_AFTER_MIN) {
          setPickupPopupVisible(false);
          return;
        }

        const dateKey = pickupDateKey(now);
        const storageKey = `${PICKUP_DISMISSED_STORAGE_PREFIX}:${child.id}:${dateKey}`;
        if (dismissedPickupKeys.current.has(storageKey)) return;
        if (pickupPopupChildId === child.id && pickupPopupVisible) return;

        try {
          const dismissed = await AsyncStorage.getItem(storageKey);
          if (!active) return;
          if (dismissed !== null) {
            dismissedPickupKeys.current.add(storageKey);
            setPickupPopupVisible(false);
            return;
          }
        } catch (error) {
          if (!active) return;
          const reason = error instanceof Error ? error.message : "Unknown storage error.";
          Alert.alert("Pickup reminder storage error", `The saved dismissal could not be checked. ${reason}`);
        }
        if (!active) return;
        setBackupMessage("");
        setPickupPopupChildId(child.id);
        setPickupPopupVisible(true);
      } finally {
        checking = false;
      }
    };

    void checkPickupTime();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void checkPickupTime();
    }, 60_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkPickupTime();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [child, locationOpen, pf.dismissMin, pf.nowMin, pf.simActive, pickupPopupChildId, pickupPopupVisible]);

  const closePickupPopup = useCallback(async () => {
    if (!child) return;
    const dateKey = pickupDateKey(new Date());
    const storageKey = `${PICKUP_DISMISSED_STORAGE_PREFIX}:${child.id}:${dateKey}`;
    dismissedPickupKeys.current.add(storageKey);
    try {
      await AsyncStorage.setItem(storageKey, "dismissed");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown storage error.";
      Alert.alert("Pickup reminder not saved", `This reminder may appear again after reopening the app. ${reason}`);
    }
    setPickupPopupVisible(false);
  }, [child]);

  const openGpsForPickup = useCallback(() => {
    pendingGpsOpen.current = true;
    setPickupPopupVisible(false);
  }, []);

  const activateCircleBackup = useCallback(async () => {
    const eligiblePeople = pf.people.filter((person) => person.approved && person.id !== pf.viewerId);
    if (flow.phase === "asking") {
      const count = flow.recipients.length;
      setBackupBanner({
        message: count > 0 ? `A backup request is already active for ${count} people` : "A backup request is already active",
        empty: false,
      });
      setCircleScrollRequest((request) => request + 1);
      setBackupBusy(false);
      return;
    }
    if (eligiblePeople.length === 0) {
      setBackupBanner({ message: "No one in your circle yet", empty: true });
      setBackupBusy(false);
      return;
    }

    setBackupBusy(true);
    try {
      const started = await pf.run("find_backup");
      if (!started) {
        setBackupBanner({
          message: pf.error ?? "Nobody could be asked. Check that your circle has approved members.",
          empty: false,
        });
        setBackupBusy(false);
        return;
      }
      const askedCount = pf.groupRequests === false
        ? Math.min(1, eligiblePeople.length)
        : eligiblePeople.length;
      setBackupBanner({
        message: pf.simActive
          ? `Demo request sent to ${askedCount} ${askedCount === 1 ? "person" : "people"}. Nobody was contacted.`
          : `Backup request sent to ${askedCount} ${askedCount === 1 ? "person" : "people"}.`,
        empty: false,
      });
      setCircleScrollRequest((request) => request + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown backup request error.";
      setBackupBanner({ message: `Unable to start a backup request. ${reason}`, empty: false });
    } finally {
      setBackupBusy(false);
    }
  }, [flow.phase, flow.recipients.length, pf]);

  const closePopupAndActivateBackup = useCallback(() => {
    if (backupBusy) return;
    pendingBackupRequest.current = true;
    setBackupBusy(true);
    void closePickupPopup();
  }, [backupBusy, closePickupPopup]);

  const onPickupPopupExited = useCallback(() => {
    setPickupPopupChildId(null);
    if (pendingGpsOpen.current) {
      pendingGpsOpen.current = false;
      setLocationOpen(true);
      return;
    }
    if (pendingBackupRequest.current) {
      pendingBackupRequest.current = false;
      void activateCircleBackup();
    }
  }, [activateCircleBackup]);

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
      scrollTargetRef={circleCardRef}
      scrollRequest={circleScrollRequest}
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

      {backupBanner ? (
        <Rise i={1} kind="swap">
          <View style={{ gap: 8 }}>
            <Banner>{backupBanner.message}</Banner>
            {backupBanner.empty ? (
              <Link href="/circle" asChild>
                <Press
                  label="Open the Circle tab"
                  role="link"
                  style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.colors.line, borderRadius: 12 }}
                >
                  <T s={0.92} w={700} c={theme.colors.primaryInk}>Open Circle</T>
                </Press>
              </Link>
            ) : null}
          </View>
        </Rise>
      ) : null}

      <View ref={circleCardRef}>
        <PickupStatusCard pf={pf} childName={child.name} />
      </View>

      <NextStepCard />

      <Rise i={2}>
        <Card tight>
          <NavRow first href="/plan" icon="plan" title="Pickup plan" sub={`${child.name} · ${school.name}`} />
          <NavRow href="/circle" icon="circle" title="Trusted circle" sub={`${readyHelpers} helper${readyHelpers === 1 ? "" : "s"} ready to collect`} />
        </Card>
      </Rise>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} pf={pf} />
      <FullMap visible={mapOpen} onClose={() => setMapOpen(false)} dots={dots} trail={collected} />
      <DeviceLocationModal
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        schoolName={school?.name ?? ""}
        schoolAddress={school?.address ?? ""}
        schoolLocation={schoolLocation}
      />
      {child && pickupPopupChildId === child.id ? (
        <PickupEstimatePopup
          visible={pickupPopupVisible}
          accessibilityLabel="Pickup estimate"
          childName={child.name}
          schoolName={school?.name ?? ""}
          schoolAddress={school?.address ?? ""}
          schoolLocation={schoolLocation}
          onClose={() => void closePickupPopup()}
          onGo={openGpsForPickup}
          onExited={onPickupPopupExited}
          onActivateBackup={closePopupAndActivateBackup}
          backupBusy={backupBusy}
          backupMessage={backupMessage}
        />
      ) : null}
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
