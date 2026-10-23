import { useRef, useState } from "react";
import { Image, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, Btn, Press, T, useColors } from "../shared/ui";
import type { PhoneLocationSnapshot } from "../shared/phoneLocation";
import { DeviceLocationMap } from "./DeviceLocationMap";
import type { todayMapModel } from "./todayMapModel";

export function TodayGpsHeader({ model, snapshot, demo, clockLabel, onDemo, onGps, onRefresh, onAllow, onSettings }: {
  model: ReturnType<typeof todayMapModel>; snapshot: PhoneLocationSnapshot; demo: boolean; clockLabel: string | null;
  onDemo: () => void; onGps: () => void; onRefresh: () => void; onAllow: () => void; onSettings: () => void;
}) {
  const c = useColors(), insets = useSafeAreaInsets(), { height } = useWindowDimensions();
  const hasMapAnchor = useRef(false);
  if (model.point || model.school) hasMapAnchor.current = true;
  const [recenter, setRecenter] = useState(0);
  return <View style={{ height: Math.max(380, Math.min(460, height * 0.49)) + insets.top, backgroundColor: c.map, overflow: "hidden" }}>
    {hasMapAnchor.current ? <DeviceLocationMap point={model.point} destination={model.school} destinationTitle={model.schoolTitle}
      additionalPoints={model.additionalPoints} cameraMode="explore" recenterRequest={recenter} />
      : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}><T c="muted">Waiting for this phone's GPS</T></View>}
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 6 }}>
        <Image source={require("../../../assets/images/logo.png")} style={{ width: 30, height: 30, borderRadius: 15 }} /><T w={700}>SafeNest</T>
      </Glass>
      {clockLabel ? <Glass style={{ padding: 8 }}><T w={700} tab>{clockLabel}</T></Glass> : null}
      <Press onPress={onDemo} label="Open demo controls" style={{ minHeight: 44, justifyContent: "center" }}><Glass style={{ padding: 10 }}><T w={700}>Demo</T></Glass></Press>
    </View>
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 36 }}>
      <Glass style={{ padding: 10, gap: 4 }}>
        <T w={800} s={0.88}>{model.title}</T>
        <T s={0.74} c="muted" lh={1.3}>{model.detail}</T>
        {model.schoolMissing ? <T s={0.74} c="muted">School coordinates unavailable. No school pin is shown.</T> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Btn kind="o" sm disabled={!model.point} onPress={() => setRecenter(n => n + 1)}>Recenter</Btn>
          {!demo ? snapshot.kind === "permission_needed"
            ? <Btn kind="o" sm onPress={snapshot.blocked ? onSettings : onAllow}>{snapshot.blocked ? "Settings" : "Allow location"}</Btn>
            : <Btn kind="o" sm disabled={snapshot.kind === "checking"} onPress={onRefresh}>Refresh</Btn> : null}
          <Btn kind="o" sm onPress={onGps}>{demo ? "Phone GPS (real)" : "Phone GPS"}</Btn>
        </View>
      </Glass>
    </View>
  </View>;
}
