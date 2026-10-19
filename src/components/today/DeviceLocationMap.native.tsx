import MapView, { Circle, Marker } from "react-native-maps";

export type DeviceLocationPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  title: string;
  detail?: string;
};

export function DeviceLocationMap({ point }: { point: DeviceLocationPoint }) {
  const region = {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  return (
    <MapView style={{ flex: 1 }} initialRegion={region} region={region} showsCompass showsScale>
      <Circle
        center={{ latitude: point.latitude, longitude: point.longitude }}
        radius={Math.max(point.accuracy ?? 20, 10)}
        fillColor="rgba(33, 137, 117, 0.16)"
        strokeColor="rgba(33, 137, 117, 0.65)"
        strokeWidth={1}
      />
      <Marker
        coordinate={{ latitude: point.latitude, longitude: point.longitude }}
        title={point.title}
        description={point.detail}
      />
    </MapView>
  );
}
