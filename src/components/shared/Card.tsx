import { useId, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppContext } from "./AppContext";
import { ToneProvider } from "./ui";
import type { Tone } from "./ui";

type CardProps = {
  children: ReactNode;
  variant?: "default" | "hero" | "warning";
  // Compact list card (rows supply their own padding).
  tight?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, variant = "default", tight = false, style }: CardProps) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const tone: Tone = variant === "hero" ? "hero" : variant === "warning" ? "warn" : "default";
  const shadow = theme.isDark
    ? "0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35)"
    : "0 1px 2px rgba(18,55,71,.06), 0 8px 24px rgba(18,55,71,.10)";
  const [box, setBox] = useState({ w: 0, h: 0 });
  const base: ViewStyle = {
    backgroundColor: tone === "warn" ? c.warning : c.card,
    borderWidth: tone === "default" ? 1 : tone === "warn" ? 1 : 0,
    borderColor: tone === "warn" ? "rgba(160,120,0,.28)" : c.line,
    borderRadius: 22,
    paddingVertical: tight ? 4 : 18,
    paddingHorizontal: tight ? 16 : 18,
    overflow: "hidden",
    boxShadow: tone === "warn" ? undefined : shadow,
  };
  return (
    <ToneProvider value={tone}>
      <View
        style={[base, tone === "hero" ? { backgroundColor: c.heroStart } : null, style]}
        onLayout={tone === "hero" ? (e) => {
          const { width, height } = e.nativeEvent.layout;
          setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
        } : undefined}
      >
        {tone === "hero" && box.w > 0 && box.h > 0 ? (
          // Pixel-sized layer, measured from the card itself. Percent sizing of an absolute SVG is unreliable on iOS.
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: box.w, height: box.h }}>
            <Svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2={box.w} y2={box.h} gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={c.heroStart} />
                  <Stop offset="1" stopColor={c.heroEnd} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={box.w} height={box.h} fill={`url(#${gid})`} />
            </Svg>
          </View>
        ) : null}
        {children}
      </View>
    </ToneProvider>
  );
}
