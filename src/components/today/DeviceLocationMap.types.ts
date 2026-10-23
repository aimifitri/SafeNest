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
  /** Header camera: first fix only, then explicit recenter. Navigation retains automatic behavior. */
  cameraMode?: "automatic" | "explore";
  recenterRequest?: number;
  additionalPoints?: readonly (DeviceLocationPoint & { id: string })[];
  destination?: DeviceLocationCoordinate | null;
  destinationTitle?: string;
  showPreview?: boolean;
  routeCoordinates?: readonly RouteCoordinate[];
  travelledCoordinates?: readonly RouteCoordinate[];
  navigationActive?: boolean;
  legalLabelBottomInset?: number;
};
