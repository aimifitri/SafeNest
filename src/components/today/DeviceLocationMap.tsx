import { View } from "react-native";

import { T } from "../shared/ui";
import type { DeviceLocationPoint } from "./DeviceLocationMap.native";

export function DeviceLocationMap({ point }: { point: DeviceLocationPoint }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: "#E7F0ED" }}>
      <T s={0.9} w={700}>{point.title}</T>
      <T s={0.84} c="muted" align="center">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</T>
      <T s={0.76} c="muted" align="center">The live map is available in the iOS and Android app.</T>
    </View>
  );
}
