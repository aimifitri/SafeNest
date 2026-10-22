import type { LocationObject, LocationSubscription } from "expo-location";

function locationError(error: GeolocationPositionError): Error {
  switch (error.code) {
    case 1: return new Error("Location access is blocked. Allow location in your browser's site settings, then try again.");
    case 2: return new Error("Your browser cannot determine your location. Check device location services and try again.");
    case 3: return new Error("Location request timed out. Try again where your device has better reception.");
    default: return new Error("Unable to get your browser location. Please try again.");
  }
}

function toLocation(position: GeolocationPosition): LocationObject {
  const c = position.coords;
  return { timestamp: position.timestamp, coords: {
    latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy,
    altitude: c.altitude, altitudeAccuracy: c.altitudeAccuracy, heading: c.heading, speed: c.speed,
  } };
}

// Access browser globals only when called, keeping Expo static rendering safe.
export async function startBrowserLocation(
  onUpdate: (location: LocationObject) => void,
  onError: (message: string) => void,
  isCurrent: () => boolean,
): Promise<LocationSubscription> {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new Error("Browser location requires HTTPS or localhost. Open SafeNest using a secure connection.");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("This browser does not support geolocation. Try a browser with location support.");
  }
  const geo = navigator.geolocation;
  const options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
  const initial = await new Promise<GeolocationPosition>((resolve, reject) => {
    geo.getCurrentPosition(resolve, (error) => reject(locationError(error)), options);
  });
  // Browser permission prompts cannot be cancelled; ignore results after closing.
  if (!isCurrent()) return { remove() {} };
  onUpdate(toLocation(initial));
  const id = geo.watchPosition(
    (position) => { if (isCurrent()) onUpdate(toLocation(position)); },
    (error) => { if (isCurrent()) onError(locationError(error).message); },
    options,
  );
  return { remove: () => geo.clearWatch(id) };
}
