import * as Location from "expo-location";
import { createPhoneLocation } from "./phoneLocation";

const phones = new Map<string, ReturnType<typeof makeEntry>>();
function makeEntry(scope: string) {
  let users = 0;
  const controller = createPhoneLocation({
    permission: ask => ask ? Location.requestForegroundPermissionsAsync() : Location.getForegroundPermissionsAsync(),
    services: () => Location.hasServicesEnabledAsync(),
    position: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    reverse: async point => {
      const address = (await Location.reverseGeocodeAsync(point))[0];
      if (!address || (!address.city && !address.region)) return null;
      return [...new Set([address.city, address.region, address.country].filter(Boolean))].join(", ") || null;
    },
    now: Date.now,
  });
  const entry = { controller, retain() {
    users++; phones.set(scope, entry);
    return () => { if (--users === 0) { controller.invalidate(); if (phones.get(scope) === entry) phones.delete(scope); } };
  } };
  return entry;
}
export function phoneLocationFor(scope: string) {
  const entry = phones.get(scope) ?? makeEntry(scope);
  phones.set(scope, entry); return entry;
}
