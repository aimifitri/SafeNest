// Illustrated map from the HTML prototype (400x320 viewBox, same roads/blocks/water/park shapes).
// Everything on it is simulated; positions are supplied by the caller.
import { useEffect, useId, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";

import { useAppContext } from "./AppContext";
import { avatarIndex } from "./Avatar";
import { EASE_OUT, anim } from "./motion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type MapDot = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** pulsing ring (the person doing today's pickup) */
  ring?: boolean;
  hidden?: boolean;
};

// ---- the blue trail: M270 96 C270 130 300 150 320 190 S300 270 220 285 L140 288, sampled for the moving dot
type Pt = [number, number];
function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const a = 1 - u;
  return [
    a * a * a * p0[0] + 3 * a * a * u * p1[0] + 3 * a * u * u * p2[0] + u * u * u * p3[0],
    a * a * a * p0[1] + 3 * a * a * u * p1[1] + 3 * a * u * u * p2[1] + u * u * u * p3[1],
  ];
}
const XS: number[] = [];
const YS: number[] = [];
const CUM: number[] = [];
(function build() {
  const segs: Array<[Pt, Pt, Pt, Pt]> = [
    [[270, 96], [270, 130], [300, 150], [320, 190]],
    [[320, 190], [340, 230], [300, 270], [220, 285]],
  ];
  let len = 0;
  let last: Pt | null = null;
  const push = (p: Pt) => {
    if (last) len += Math.hypot(p[0] - last[0], p[1] - last[1]);
    XS.push(p[0]);
    YS.push(p[1]);
    CUM.push(len);
    last = p;
  };
  segs.forEach((s, si) => {
    for (let i = si === 0 ? 0 : 1; i <= 120; i++) push(cubic(s[0], s[1], s[2], s[3], i / 120));
  });
  for (let i = 1; i <= 20; i++) push([220 + (140 - 220) * (i / 20), 285 + (288 - 285) * (i / 20)]);
})();
const TL = CUM[CUM.length - 1];
const TRAIL_D = "M270 96 C270 130 300 150 320 190 S300 270 220 285 L140 288";
const SVG_FONT = Platform.OS === "web" ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

function easeIO(x: number): number {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

type MapProps = {
  dots: MapDot[];
  /** draws the collector's route (only after pickup) */
  trail?: boolean;
  label: string;
  schoolText?: string;
  stoppedText?: string;
  /** "cover" crops the 400x320 artwork to fill (Today header). "contain" frames the whole 400x320 scene inside the
   *  free area while the map artwork still fills every pixel of the viewport (full-screen map). */
  fit?: "cover" | "contain";
  /** Space reserved for overlays (safe areas, close button, disclaimer) when fit="contain". */
  inset?: { top: number; bottom: number };
};

export function MapView({ dots, trail = false, label, schoolText = "School", stoppedText = "Car stopped", fit = "cover", inset }: MapProps) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const reduce = useReducedMotion();
  const patId = "blk" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };

  // viewBox "0 0 400 320" with preserveAspectRatio slice
  const { sc, ox, oy } = useMemo(() => {
    const { w, h } = box;
    if (!w || !h) return { sc: 0, ox: 0, oy: 0 };
    if (fit === "contain") {
      const top = inset?.top ?? 0;
      const free = Math.max(120, h - top - (inset?.bottom ?? 0));
      const s = Math.min(w / 400, free / 320);
      return { sc: s, ox: (w - 400 * s) / 2, oy: top + (free - 320 * s) / 2 };
    }
    const s = Math.max(w / 400, h / 320);
    return { sc: s, ox: (w - 400 * s) / 2, oy: (h - 320 * s) / 2 };
  }, [box, fit, inset?.top, inset?.bottom]);
  // World-space window actually visible. For "contain" it extends past 400x320 so the artwork fills the viewport.
  const viewBox = fit === "contain" && sc > 0 ? `${-ox / sc} ${-oy / sc} ${box.w / sc} ${box.h / sc}` : "0 0 400 320";

  // trail progress: linear time, eased inside the worklet (5.2s, ease-in-out like the prototype)
  const lin = useSharedValue(0);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!trail) {
      lin.set(0);
      setStopped(false);
      return;
    }
    if (reduce) {
      lin.set(1);
      setStopped(true);
      return;
    }
    lin.set(0);
    lin.set(withTiming(1, { duration: 5200, easing: Easing.linear }));
    const tm = setTimeout(() => setStopped(true), 5200);
    return () => clearTimeout(tm);
  }, [trail, reduce, lin]);

  const dashProps = useAnimatedProps(() => ({ strokeDashoffset: TL * (1 - easeIO(lin.get())) }));
  const carProps = useAnimatedProps(() => {
    const len = TL * easeIO(lin.get());
    let lo = 0;
    let hi = CUM.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (CUM[m] < len) lo = m;
      else hi = m;
    }
    const span = CUM[hi] - CUM[lo] || 1;
    const f = Math.min(1, Math.max(0, (len - CUM[lo]) / span));
    return { cx: XS[lo] + (XS[hi] - XS[lo]) * f, cy: YS[lo] + (YS[hi] - YS[lo]) * f };
  });

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.map, overflow: "hidden" }}
    >
      <Svg width={box.w || "100%"} height={box.h || "100%"} viewBox={viewBox} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id={patId} width={86} height={74} patternUnits="userSpaceOnUse">
            <Rect x={8} y={8} width={70} height={58} rx={9} fill={c.block} />
          </Pattern>
        </Defs>
        <Rect x={-400} y={-600} width={1200} height={1500} fill={c.map} />
        <Rect x={-400} y={-600} width={1200} height={1500} fill={`url(#${patId})`} />
        <Path d="M-400 340 C-200 300 -60 360 60 340 S220 290 330 330 S520 360 800 330 V900 H-400Z" fill={c.water} />
        <Rect x={150} y={205} width={86} height={62} rx={14} fill={c.park} />
        <Rect x={-10} y={95} width={82} height={48} rx={14} fill={c.park} />
        <G fill="none" stroke={c.road} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M-60 190 C80 180 220 215 460 170" strokeWidth={15} />
          <Path d="M175 -300 C190 -100 150 80 190 340" strokeWidth={15} />
          <Path d="M-60 40 C100 60 260 20 460 50" strokeWidth={12} />
          <Path d="M320 -200 C330 0 300 140 340 300" strokeWidth={11} />
        </G>
        <G opacity={trail ? 1 : 0}>
          <AnimatedPath d={TRAIL_D} fill="none" stroke={c.map} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${TL}`} animatedProps={dashProps} />
          <AnimatedPath d={TRAIL_D} fill="none" stroke={c.trail} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${TL}`} animatedProps={dashProps} />
          <AnimatedCircle r={15} fill={c.trail} opacity={0.25} cx={270} cy={96} animatedProps={carProps} />
          <AnimatedCircle r={9} fill="#FFFFFF" stroke={c.trail} strokeWidth={4} cx={270} cy={96} animatedProps={carProps} />
        </G>
        <G x={270} y={96}>
          <Rect x={-17} y={-17} width={34} height={34} rx={11} fill={c.pin} stroke="#FFFFFF" strokeWidth={3} />
          <Path d="M-7 5V-3l7-5 7 5V5zM-2 5V0h4v5" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" />
        </G>
        <SvgText x={270} y={130} textAnchor="middle" fontFamily={SVG_FONT} fontSize={12} fontWeight="700" stroke={c.map} strokeWidth={4} fill={c.map}>{schoolText}</SvgText>
        <SvgText x={270} y={130} textAnchor="middle" fontFamily={SVG_FONT} fontSize={12} fontWeight="700" fill={c.ink}>{schoolText}</SvgText>
      </Svg>

      {sc > 0 && (
        <>
          <Animated.Text
            pointerEvents="none"
            style={{
              position: "absolute", left: ox + 140 * sc - 80, width: 160, top: oy + 300 * sc, textAlign: "center", fontSize: 12, fontWeight: "700", color: c.ink,
              textShadowColor: c.map, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 },
              opacity: trail && stopped ? 1 : 0, transitionProperty: "opacity", transitionDuration: 400, transitionTimingFunction: "ease",
            }}
          >
            {stoppedText}
          </Animated.Text>
          {dots.map((d) => {
            const col = c.avatars[avatarIndex(d.name)];
            const r = 15 * sc;
            const ini = d.name.replace(/^(Encik|Kak|Pn\.)\s+/, "").slice(0, 2);
            return (
              <Animated.View
                key={d.id}
                pointerEvents="none"
                style={{
                  position: "absolute", left: 0, top: 0, width: 0, height: 0, opacity: d.hidden ? 0 : 1,
                  transform: [{ translateX: ox + d.x * sc }, { translateY: oy + d.y * sc }],
                  transitionProperty: "transform", transitionDuration: 1200, transitionTimingFunction: EASE_OUT,
                }}
              >
                {d.ring && !reduce ? (
                  <Animated.View
                    style={[{ position: "absolute", left: -r, top: -r, width: 2 * r, height: 2 * r, borderRadius: r, backgroundColor: col }, anim("ring", { ms: 2200, loop: true, fill: "none" })]}
                  />
                ) : null}
                <View
                  style={{
                    position: "absolute", left: -(r + 1.5 * sc), top: -(r + 1.5 * sc), width: 2 * (r + 1.5 * sc), height: 2 * (r + 1.5 * sc),
                    borderRadius: r + 1.5 * sc, backgroundColor: col, borderWidth: 3 * sc, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 12 * sc, fontWeight: "700", color: "#FFFFFF", includeFontPadding: false }}>{ini}</Text>
                </View>
              </Animated.View>
            );
          })}
        </>
      )}
    </View>
  );
}
