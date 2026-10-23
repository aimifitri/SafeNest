import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Image, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Btn, Press, T, useColors } from "../shared/ui";
import type { PhoneLocationSnapshot } from "../shared/phoneLocation";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { MapMarker } from "./DeviceLocationMap.types";
import type { todayMapModel } from "./todayMapModel";

/** Long enough for the zoom and fade to read, short enough that the tap still feels instant. */
export const FOCUS_MS = 560;

export function TodayGpsHeader({ model, snapshot, demo, clockLabel, gpsOpen, onDemo, onGps, onRefresh, onAllow, onSettings }: {
  model: ReturnType<typeof todayMapModel>; snapshot: PhoneLocationSnapshot; demo: boolean; clockLabel: string | null; gpsOpen: boolean;
  onDemo: () => void; onGps: () => void; onRefresh: () => void; onAllow: () => void; onSettings: () => void;
}) {
  const c = useColors(), insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const hasMapAnchor = useRef(false);
  if (model.point || model.school) hasMapAnchor.current = true;
  const [recenter, setRecenter] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setReduceMotion(v); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const markers: MapMarker[] = useMemo(() => model.members.map((m, i) => ({
    id: m.id, initial: m.initial, colorIndex: i, simulated: m.simulated, stale: m.stale, ...m.coordinate,
  })), [model.members]);
  const member = model.members.find((m) => m.id === selected) ?? null;
  useEffect(() => { if (selected && !member) setSelected(null); }, [selected, member]);

  // Phone GPS: zoom in on this phone and fade the others, then open the fullscreen view. Everyone returns when it closes.
  useEffect(() => {
    if (gpsOpen) { opened.current = true; return; }
    if (opened.current) { opened.current = false; setFocused(false); }
  }, [gpsOpen]);
  const openGps = () => {
    setSelected(null);
    if (!model.point || reduceMotion) { onGps(); return; }
    setFocused(true);
    setTimeout(() => {
      onGps();
      // If the screen refused to open (another popup is showing), bring everyone back.
      setTimeout(() => { if (!opened.current) setFocused(false); }, 900);
    }, FOCUS_MS);
  };

  const real = !demo;
  const needsPermission = real && snapshot.kind === "permission_needed";
  return <View style={{ height: Math.max(380, Math.min(460, height * 0.49)) + insets.top, backgroundColor: c.map, overflow: "hidden" }}>
    {hasMapAnchor.current ? <DeviceLocationMap mode="overview" point={model.point} school={model.school} schoolTitle={model.schoolTitle}
      markers={markers} selectedId={selected} onSelectMarker={setSelected} recenterRequest={recenter} focused={focused} reduceMotion={reduceMotion} />
      : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><T c="muted">Waiting for this phone's GPS</T></View>}
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 6 }}>
        <Image source={require("../../../assets/images/logo.png")} style={{ width: 30, height: 30, borderRadius: 15 }} /><T w={700}>SafeNest</T>
      </Glass>
      {clockLabel ? <Glass style={{ padding: 8 }}><T w={700} tab>{clockLabel}</T></Glass> : null}
      {demo ? <Press onPress={onDemo} label="Open demo controls" style={{ minHeight: 44, justifyContent: "center" }}><Glass style={{ padding: 10 }}><T w={700}>Demo</T></Glass></Press> : null}
    </View>
    {model.demoLabel ? (
      <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 62, left: 16 }}>
        <Glass radius={10} style={{ paddingHorizontal: 10, paddingVertical: 5 }}><T s={0.72} w={700}>{model.demoLabel}</T></Glass>
      </View>
    ) : null}
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 36 }}>
      {member ? (
        <Glass radius={16} style={{ padding: 12, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.avatars[model.members.indexOf(member) % c.avatars.length] ?? c.primary }}>
              <T w={800} c="#FFFFFF">{member.initial}</T>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={800} s={0.95}>{member.name}</T>
              <T s={0.76} c="muted">{member.role}</T>
            </View>
            <Press onPress={() => setSelected(null)} label={`Close ${member.name}'s details`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name="close" size={20} color={c.ink} />
            </Press>
          </View>
          <T s={0.78} lh={1.35}>{member.pickup}{member.availability ? `. ${member.availability}.` : "."}</T>
          <T s={0.78} c="muted" lh={1.35}>{member.locationNote}{member.distanceFromSchool ? ` About ${member.distanceFromSchool} from school.` : ""}</T>
        </Glass>
      ) : (
        <Glass radius={16} style={{ padding: 10, gap: 4 }}>
          <T w={800} s={0.88}>{model.title}</T>
          <T s={0.74} c="muted" lh={1.3}>{model.detail}</T>
          {model.schoolMissing && !model.demoLabel ? <T s={0.74} c="muted">No school pin: school coordinates unavailable.</T> : null}
          {real && model.sharingNote ? <T s={0.74} c="muted" lh={1.3}>{model.sharingNote}</T> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(model.point ? 1 : 0) + (model.school ? 1 : 0) + model.members.length > 1
              ? <Btn kind="o" sm onPress={() => setRecenter(n => n + 1)} label="Show everyone on the map">Recenter</Btn> : null}
            {real ? needsPermission
              ? <Btn kind="o" sm onPress={snapshot.blocked ? onSettings : onAllow}>{snapshot.blocked ? "Settings" : "Allow location"}</Btn>
              : <Btn kind="o" sm disabled={snapshot.kind === "checking"} onPress={onRefresh}>Refresh</Btn> : null}
            <Btn kind="o" sm onPress={openGps} label="Open Phone GPS, my location only">Phone GPS</Btn>
          </View>
        </Glass>
      )}
    </View>
  </View>;
}
