export type DeviceLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type DeviceLocationPoint = DeviceLocationCoordinate & {
  accuracy: number | null;
  title: string;
  detail?: string;
};

export type DeviceLocationMapProps = {
  point: DeviceLocationPoint | null;
  destination?: DeviceLocationCoordinate | null;
  onSelectDestination?: (coordinate: DeviceLocationCoordinate) => void;
};
