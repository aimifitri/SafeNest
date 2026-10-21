export type DeviceLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type DeviceLocationPoint = DeviceLocationCoordinate & {
  accuracy: number | null;
  title: string;
  detail?: string;
};

export type RouteCoordinate = DeviceLocationCoordinate;

export type DeviceLocationMapProps = {
  point: DeviceLocationPoint | null;
  destination?: DeviceLocationCoordinate | null;
  destinationTitle?: string;
  showPreview?: boolean;
  routeCoordinates?: readonly RouteCoordinate[];
  travelledCoordinates?: readonly RouteCoordinate[];
  navigationActive?: boolean;
  onSelectDestination?: (coordinate: DeviceLocationCoordinate) => void;
};
