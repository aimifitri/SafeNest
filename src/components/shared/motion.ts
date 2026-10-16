import { Easing, cubicBezier } from "react-native-reanimated";
import type { ViewStyle } from "react-native";

// The prototype's CSS custom properties: --ease-out, --ease-in-out, --ease-drawer.
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);
export const EASE_DRAWER = cubicBezier(0.32, 0.72, 0, 1);

// Worklet-side equivalents (for withTiming).
export const W_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const W_EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

// The prototype's @keyframes, written for Reanimated CSS animations (UI thread).
export const KF = {
  swap: { from: { opacity: 0, transform: [{ translateY: 10 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
  ring: { from: { transform: [{ scale: 0.7 }], opacity: 0.55 }, to: { transform: [{ scale: 2.4 }], opacity: 0 } },
  pop: { from: { transform: [{ scale: 0.88 }], opacity: 0.4 }, to: { transform: [{ scale: 1 }], opacity: 1 } },
  spin: { from: { transform: [{ rotate: "0deg" }] }, to: { transform: [{ rotate: "360deg" }] } },
  ping: { from: { transform: [{ scale: 0.85 }], opacity: 0.7 }, to: { transform: [{ scale: 1.15 }], opacity: 0 } },
  fade: { from: { opacity: 0 }, to: { opacity: 1 } },
  fadeout: { from: { opacity: 1 }, to: { opacity: 0 } },
  up: { from: { transform: [{ translateY: "100%" }] }, to: { transform: [{ translateY: "0%" }] } },
  down: { from: { transform: [{ translateY: "0%" }] }, to: { transform: [{ translateY: "100%" }] } },
} as const;

type KeyframeName = keyof typeof KF;
type AnimOptions = {
  ms: number;
  ease?: unknown;
  delay?: number;
  loop?: boolean;
  fill?: "both" | "forwards" | "backwards" | "none";
};

/** Builds the animation* style props for a named keyframe set. Returns {} when motion is reduced. */
export function anim(name: KeyframeName, o: AnimOptions, reduce = false): ViewStyle {
  if (reduce) return {};
  return {
    animationName: KF[name],
    animationDuration: o.ms,
    animationTimingFunction: (o.ease ?? EASE_OUT) as never,
    animationDelay: o.delay ?? 0,
    animationIterationCount: o.loop ? "infinite" : 1,
    animationFillMode: o.fill ?? "both",
  } as ViewStyle;
}
