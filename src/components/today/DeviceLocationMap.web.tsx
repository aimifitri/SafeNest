import { useMemo, useState } from "react";
import { Image, View } from "react-native";
import type { GestureResponderEvent, LayoutChangeEvent } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import type { DeviceLocationCoordinate, DeviceLocationMapProps } from "./DeviceLocationMap.types";

const TILE_SIZE = 256;
const ZOOM = 15;

function worldTile(coordinate: DeviceLocationCoordinate) {
  const scale = 2 ** ZOOM;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, coordinate.latitude));
  const radians = latitude * Math.PI / 180;
  return {
    x: (coordinate.longitude + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale,
  };
}

function wrapTileX(x: number) {
  const scale = 2 ** ZOOM;
  return ((x % scale) + scale) % scale;
}

function coordinateAtPixel(x: number, y: number, width: number, height: number, center: DeviceLocationCoordinate): DeviceLocationCoordinate {
  const centerTile = worldTile(center);
  const scale = 2 ** ZOOM;
  const worldX = wrapTileX(centerTile.x + (x - width / 2) / TILE_SIZE);
  const worldY = Math.max(0, Math.min(scale, centerTile.y + (y - height / 2) / TILE_SIZE));
  const longitude = worldX / scale * 360 - 180;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY / scale))) * 180 / Math.PI;
  return { latitude, longitude };
}

export function DeviceLocationMap({ point, destination, routeCoordinates, onSelectDestination }: DeviceLocationMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const center = point ?? destination ?? null;
  const centerTile = center ? worldTile(center) : null;
  const tiles = useMemo(() => {
    if (!centerTile || size.width <= 0 || size.height <= 0) return [];
    const minX = Math.floor(centerTile.x - size.width / (2 * TILE_SIZE)) - 1;
    const maxX = Math.ceil(centerTile.x + size.width / (2 * TILE_SIZE)) + 1;
    const minY = Math.floor(centerTile.y - size.height / (2 * TILE_SIZE)) - 1;
    const maxY = Math.ceil(centerTile.y + size.height / (2 * TILE_SIZE)) + 1;
    const result: Array<{ key: string; uri: string; left: number; top: number }> = [];
    for (let y = minY; y <= maxY; y += 1) {
      if (y < 0 || y >= 2 ** ZOOM) continue;
      for (let x = minX; x <= maxX; x += 1) {
        const wrappedX = wrapTileX(x);
        result.push({
          key: `${ZOOM}/${wrappedX}/${y}`,
          uri: `https://tile.openstreetmap.org/${ZOOM}/${wrappedX}/${y}.png`,
          left: size.width / 2 + (x - centerTile.x) * TILE_SIZE,
          top: size.height / 2 + (y - centerTile.y) * TILE_SIZE,
        });
      }
    }
    return result;
  }, [centerTile?.x, centerTile?.y, size.height, size.width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => current.width === width && current.height === height ? current : { width, height });
  };

  const onMapTap = (event: GestureResponderEvent) => {
    if (!onSelectDestination || !center || size.width <= 0 || size.height <= 0) return;
    const { locationX, locationY } = event.nativeEvent;
    onSelectDestination(coordinateAtPixel(locationX, locationY, size.width, size.height, center));
  };

  const routePoints = routeCoordinates?.map((coordinate) => {
    if (!centerTile) return "";
    const tile = worldTile(coordinate);
    return `${size.width / 2 + (tile.x - centerTile.x) * TILE_SIZE},${size.height / 2 + (tile.y - centerTile.y) * TILE_SIZE}`;
  }).join(" ") ?? "";

  return (
    <View
      onLayout={onLayout}
      onStartShouldSetResponder={onSelectDestination ? () => true : undefined}
      onResponderRelease={onSelectDestination ? onMapTap : undefined}
      style={{ flex: 1, overflow: "hidden", backgroundColor: "#E7F0ED" }}
      accessibilityLabel={onSelectDestination ? "Map. Tap to choose a destination." : "Live map showing this device's location"}
    >
      {tiles.map((tile) => (
        <Image
          key={tile.key}
          source={{ uri: tile.uri }}
          resizeMode="stretch"
          style={{ position: "absolute", left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
          accessibilityIgnoresInvertColors
        />
      ))}
      {size.width > 0 && size.height > 0 && routePoints ? (
        <Svg pointerEvents="none" width={size.width} height={size.height} style={{ position: "absolute", left: 0, top: 0 }}>
          <Polyline points={routePoints} fill="none" stroke="#0F7D86" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
      {destination && centerTile ? (
        <View style={{ position: "absolute", left: size.width / 2 + (worldTile(destination).x - centerTile.x) * TILE_SIZE - 10, top: size.height / 2 + (worldTile(destination).y - centerTile.y) * TILE_SIZE - 10, width: 20, height: 20, borderRadius: 10, backgroundColor: "#B3261E", borderWidth: 3, borderColor: "white" }} accessibilityLabel="Destination" />
      ) : null}
      {point ? (
        <View style={{ position: "absolute", left: size.width / 2 - 15, top: size.height / 2 - 15, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(32,138,239,0.2)", alignItems: "center", justifyContent: "center" }} accessibilityLabel={`Live GPS location ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#208AEF", borderWidth: 3, borderColor: "white" }} />
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: "absolute", right: 7, bottom: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.88)" }}>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: "#1D2939", fontSize: 11, textDecoration: "none" }}>© OpenStreetMap contributors</a>
      </View>
      {point ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 8, bottom: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.92)" }}>
          <span style={{ color: "#1D2939", fontSize: 11 }}>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span>
        </View>
      ) : null}
      {onSelectDestination ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 46, alignItems: "center" }}>
          <span style={{ padding: "5px 9px", borderRadius: 8, color: "#1D2939", background: "rgba(255,255,255,0.92)", fontSize: 12 }}>Tap map to choose a destination</span>
        </View>
      ) : null}
    </View>
  );
}
