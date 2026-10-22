import { View } from "react-native";

import { T } from "../shared/ui";
import type { DeviceLocationMapProps } from "./DeviceLocationMap.types";

export function DeviceLocationMap({ point, destination, routeCoordinates }: DeviceLocationMapProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: "#E7F0ED" }}>
      {point ? (
        <>
          <T s={0.9} w={700}>{point.title}</T>
          <T s={0.84} c="muted" align="center">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</T>
        </>
      ) : null}
      {destination ? (
        <>
          <T s={0.9} w={700}>Destination</T>
          <T s={0.84} c="muted" align="center">{destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}</T>
        </>
      ) : null}
      {routeCoordinates && routeCoordinates.length > 1 ? (
        <T s={0.76} c="muted" align="center">This OSRM route contains {routeCoordinates.length} path points. Route drawing is available in the iOS and Android app.</T>
      ) : (
        <T s={0.76} c="muted" align="center">Interactive maps are available in the iOS and Android app.</T>
      )}
    </View>
  );
}
