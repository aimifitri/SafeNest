export type DeviceLocationCoordinate = {
  latitude: number;
  longitude: number;
};

export type DeviceLocationPoint = DeviceLocationCoordinate & {
  accuracy: number | null;
  title: string;
  detail?: string;
};

export type MapMarker = DeviceLocationCoordinate & {
  id: string;
  initial: string;
  /** Index into the theme avatar colours. */
  colorIndex: number;
  simulated: boolean;
  stale?: boolean;
};

export type DeviceLocationMapProps = {
  /** This phone. Drawn as a blue GPS dot with an accuracy ring. */
  point: DeviceLocationPoint | null;
  /** "overview" shows you, the school and the circle. "me" shows only this phone. */
  mode?: "overview" | "me";
  school?: DeviceLocationCoordinate | null;
  schoolTitle?: string;
  markers?: readonly MapMarker[];
  selectedId?: string | null;
  onSelectMarker?: (id: string | null) => void;
  /** Overview camera: first fix only, then explicit recenter. */
  recenterRequest?: number;
  /** Zoom in on `point` and fade out everything else. Used just before Phone GPS opens. False brings everyone back. */
  focused?: boolean;
  /** Camera to start from, so a second map can continue where the first one stopped. */
  initialCenter?: DeviceLocationCoordinate | null;
  initialDelta?: number;
  reduceMotion?: boolean;
};
