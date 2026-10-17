// Shared visual primitives for the SafeNest redesign. They only read the existing
// AppContext theme (colors, textScale, fontFamily); no business state lives here.
import { createContext, forwardRef, useContext, useState } from "react";
import type { ReactNode } from "react";
import {
  PixelRatio,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "./AppContext";
import { EASE_OUT, W_EASE_OUT, anim } from "./motion";
import { fontFace, tracking } from "./theme";
import type { ThemeTokens } from "./theme";

export function useReduce(): boolean {
  return useReducedMotion();
}

export function useColors(): ThemeTokens["colors"] {
  return useAppContext().theme.colors;
}

// ---------------------------------------------------------------- tone (hero / warning cards)
export type Tone = "default" | "hero" | "warn";
const ToneCtx = createContext<Tone>("default");
export const ToneProvider = ToneCtx.Provider;
export const useTone = () => useContext(ToneCtx);

export function toneColors(c: ThemeTokens["colors"], tone: Tone) {
  if (tone === "hero") return { ink: "#FFFFFF", muted: c.heroMuted };
  if (tone === "warn") return { ink: c.warningInk, muted: c.warningInk };
  return { ink: c.ink, muted: c.muted };
}

export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- text (sizes in rem, like the prototype)
export type TextWeight = 400 | 600 | 700 | 800;
type TProps = {
  /** size in rem (1rem = 16px, scaled by the text size setting) */
  s?: number;
  w?: TextWeight;
  /** "muted" / "ink" follow the surrounding card tone; anything else is a raw colour */
  c?: string;
  ls?: number;
  lh?: number;
  up?: boolean;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
  lines?: number;
  tab?: boolean;
  children?: ReactNode;
};

export function T({ s = 1, w = 400, c, ls, lh, up, align, style, lines, tab, children }: TProps) {
  const { theme } = useAppContext();
  const tone = useTone();
  const tc = toneColors(theme.colors, tone);
  const size = s * 16 * theme.textScale;
  let color = tc.ink;
  if (c === "muted") color = tc.muted;
  else if (c && c !== "ink") color = c;
  const st: TextStyle = {
    fontSize: size,
    lineHeight: size * (lh ?? 1.45),
    color,
    ...fontFace(theme.font, w),
    letterSpacing: ls != null ? tracking(theme.font, ls, size) : undefined,
    textAlign: align,
    textTransform: up ? "uppercase" : undefined,
    fontVariant: tab ? ["tabular-nums"] : undefined,
  };
  // The app has its own text-size control. iOS Dynamic Type would multiply on top of it, so it is capped
  // (still honoured, but never enough to break layouts).
  return (
    <Text style={[st, style]} numberOfLines={lines} maxFontSizeMultiplier={OS_FONT_CAP}>
      {children}
    </Text>
  );
}

export const OS_FONT_CAP = 1.2;

/**
 * App text-size setting combined with the capped OS font scale and the selected font's width.
 * Use it to decide when to stack columns, so wide fonts (Balloon Bold, Serif) stack before they crowd.
 */
export function useEffectiveScale(): number {
  const { theme } = useAppContext();
  return theme.textScale * Math.min(PixelRatio.getFontScale(), OS_FONT_CAP) * theme.font.widthFactor;
}

// ---------------------------------------------------------------- pressable with scale feedback
const APressable = Animated.createAnimatedComponent(Pressable);

type PressProps = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode | ((pressed: boolean) => ReactNode);
  scaleTo?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
  role?: "button" | "switch" | "radio" | "tab" | "link";
  state?: { checked?: boolean; selected?: boolean; disabled?: boolean; busy?: boolean };
  hitSlop?: number;
};

/** Press-in scales to 0.97 in 140ms ease-out (prototype: `.btn:active{transform:scale(.97)}`). */
export function Press({ onPress, style, children, scaleTo = 0.97, disabled, label, hint, role = "button", state, hitSlop }: PressProps) {
  const sv = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: sv.get() }] }));
  return (
    <APressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, ...state }}
      aria-checked={state?.checked}
      aria-selected={state?.selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={() => {
        sv.set(withTiming(scaleTo, { duration: 140, easing: W_EASE_OUT }));
        setPressed(true);
      }}
      onPressOut={() => {
        sv.set(withTiming(1, { duration: 140, easing: W_EASE_OUT }));
        setPressed(false);
      }}
      style={[style as ViewStyle, a]}
    >
      {typeof children === "function" ? children(pressed) : children}
    </APressable>
  );
}

// ---------------------------------------------------------------- button
export type BtnKind = "p" | "s" | "o" | "t" | "dash";
type BtnProps = {
  kind?: BtnKind;
  sm?: boolean;
  icon?: string;
  leading?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  hint?: string;
  flex?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Btn({ kind = "p", sm, icon, leading, onPress, disabled, loading, label, hint, flex, color, style, children }: BtnProps) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const tone = useTone();
  const off = disabled || loading;
  let bg = "transparent";
  let fg = toneColors(c, tone).ink;
  let border: string | undefined;
  let dashed = false;
  if (kind === "p") {
    bg = tone === "hero" ? c.heroButton : tone === "warn" ? c.warningInk : c.primary;
    fg = tone === "hero" ? c.heroButtonInk : tone === "warn" ? c.warning : c.onPrimary;
  } else if (kind === "s") {
    bg = tone === "hero" ? "rgba(255,255,255,.14)" : tone === "warn" ? "rgba(94,75,0,.12)" : c.primarySoft;
    fg = tone === "hero" ? "#FFFFFF" : tone === "warn" ? c.warningInk : c.primaryInk;
  } else if (kind === "o") {
    border = tone === "hero" ? "rgba(255,255,255,.3)" : c.line;
  } else if (kind === "t") {
    fg = c.danger;
  } else if (kind === "dash") {
    border = tone === "hero" ? "rgba(255,255,255,.3)" : c.line;
    dashed = true;
    fg = tone === "default" ? c.muted : toneColors(c, tone).muted;
  }
  if (color) fg = color;
  const small = sm || kind === "t" || kind === "dash";
  const base: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: small ? 44 : 54,
    paddingHorizontal: sm ? 14 : 20,
    borderRadius: sm ? 12 : 16,
    backgroundColor: bg,
    borderWidth: border ? 1.5 : 0,
    borderColor: border,
    borderStyle: dashed ? "dashed" : "solid",
    opacity: off ? 0.45 : 1,
    flex: flex ? 1 : undefined,
  };
  return (
    <Press
      onPress={onPress}
      disabled={off}
      label={label}
      hint={hint}
      state={{ disabled: off, busy: loading }}
      style={[base, style]}
    >
      {loading ? <Spinner color={fg} /> : leading}
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      {children != null ? (
        <T s={sm ? 0.92 : kind === "dash" ? 0.9 : 1.02} w={kind === "t" || kind === "dash" ? 600 : 700} c={fg} align="center" lh={1.25} style={{ flexShrink: 1 }}>
          {children}
        </T>
      ) : null}
    </Press>
  );
}

// ---------------------------------------------------------------- entrance animation (`.rise`)
/** Plays when first mounted (500ms, 60ms stagger per index); re-renders never replay it. */
export function Rise({ i = 0, kind = "rise", style, children }: { i?: number; kind?: "rise" | "swap" | "none"; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const reduce = useReduce();
  const [k] = useState({ kind, i });
  const a = k.kind === "none" ? {} : anim("swap", k.kind === "rise" ? { ms: 500, delay: k.i * 60 } : { ms: 340 }, reduce);
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------- pill (with pulsing dot) and chips
export function Pill({ children }: { children: ReactNode }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const reduce = useReduce();
  const tone = useTone();
  const dark = theme.isDark;
  let bg = c.primarySoft;
  let fg = c.primaryInk;
  if (tone === "hero") { bg = "rgba(150,228,226,.16)"; fg = c.heroButton; }
  if (tone === "warn") { bg = dark ? "rgba(243,220,138,.14)" : "rgba(94,75,0,.12)"; fg = c.warningInk; }
  return (
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: bg }}>
      <View style={{ width: 8, height: 8 }}>
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 4, backgroundColor: fg }} />
        {!reduce ? (
          <Animated.View style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 4, backgroundColor: fg }, anim("ring", { ms: 1800, loop: true, fill: "none" })]} />
        ) : null}
      </View>
      <T s={0.8} w={700} ls={0.02} c={fg}>{children}</T>
    </View>
  );
}

export type ChipKind = "yes" | "ok" | "no" | "wait" | "gold" | "plain";
export function Chip({ kind = "yes", icon, children }: { kind?: ChipKind; icon?: string; children: ReactNode }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const reduce = useReduce();
  const tone = useTone();
  let bg = c.primarySoft;
  let fg = c.primaryInk;
  if (kind === "ok") { bg = c.successSoft; fg = c.success; }
  if (kind === "no") { bg = c.dangerSoft; fg = c.danger; }
  if (kind === "gold") { bg = c.warning; fg = c.warningInk; }
  if (kind === "plain") { bg = "rgba(127,127,127,.15)"; fg = c.muted; }
  if (kind === "wait") { bg = tone === "warn" ? "rgba(94,75,0,.12)" : "rgba(127,127,127,.15)"; fg = tone === "warn" ? c.warningInk : c.muted; }
  return (
    <Animated.View style={[{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg }, anim("pop", { ms: 320 }, reduce)]}>
      {kind === "wait" ? <Spinner color={fg} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} stroke={2} /> : null}
      <T s={0.8} w={700} c={fg}>{children}</T>
    </Animated.View>
  );
}

export function Spinner({ color }: { color: string }) {
  const reduce = useReduce();
  return (
    <Animated.View style={[{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color, borderRightColor: "transparent" }, anim("spin", { ms: 800, ease: "linear", loop: true, fill: "none" }, reduce)]} />
  );
}

// ---------------------------------------------------------------- small layout pieces
export function Grab({ mb = 4 }: { mb?: number }) {
  const c = useColors();
  return <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, alignSelf: "center", marginBottom: mb }} />;
}

export function Row({ first, children, style }: { first?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const tone = useTone();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 62, borderTopWidth: first ? 0 : 1, borderTopColor: tone === "default" ? c.line : "rgba(255,255,255,.14)" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Label / value row of a details card. */
export function Dl({ k, v, first }: { k: string; v: string; first?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <View style={{ maxWidth: "45%" }}><T s={0.95} c="muted">{k}</T></View>
      <View style={{ flex: 1 }}><T s={0.95} w={700} align="right">{v}</T></View>
    </View>
  );
}

export function Banner({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "ok" }) {
  const c = useColors();
  const reduce = useReduce();
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: kind === "ok" ? c.successSoft : c.primarySoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }, anim("swap", { ms: 340 }, reduce)]}
    >
      {kind === "ok" ? <View style={{ marginTop: 2 }}><Icon name="check" size={16} color={c.success} stroke={2.6} /></View> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 7 }} />}
      <View style={{ flex: 1 }}><T s={0.9} w={600} c={kind === "ok" ? c.success : c.primaryInk} lh={1.4}>{children}</T></View>
    </Animated.View>
  );
}

/** Translucent map overlay (the prototype's frosted glass chips). */
export function Glass({ style, children, radius = 999 }: { style?: StyleProp<ViewStyle>; children?: ReactNode; radius?: number }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  return (
    <View style={[{ borderRadius: radius, backgroundColor: alpha(c.card, 0.92), boxShadow: theme.isDark ? "0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35)" : "0 1px 2px rgba(18,55,71,.06), 0 8px 24px rgba(18,55,71,.10)" }, style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- inputs
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T s={0.9} w={600}>{label}</T>
      {children}
    </View>
  );
}

type InputProps = Omit<TextInputProps, "style"> & { style?: StyleProp<TextStyle> };
export const Input = forwardRef<TextInput, InputProps>(function Input({ style, onFocus, onBlur, ...rest }, ref) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const [focus, setFocus] = useState(false);
  const fs = Math.max(16, 16 * theme.textScale);
  return (
    <TextInput maxFontSizeMultiplier={OS_FONT_CAP}
      ref={ref}
      placeholderTextColor={c.muted}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      style={[
        {
          minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: focus ? c.primary : c.line,
          backgroundColor: c.background, paddingHorizontal: 14, width: "100%", color: c.ink, fontSize: fs, ...fontFace(theme.font, 400),
          boxShadow: focus ? `0 0 0 3px ${c.primarySoft}` : undefined,
          outlineStyle: "none",
        } as unknown as TextStyle,
        style,
      ]}
      {...rest}
    />
  );
});

// ---------------------------------------------------------------- segmented control
export function Seg<V extends string>({ opts, cur, onPick }: { opts: ReadonlyArray<{ value: V; label: string; a11y: string }>; cur: V; onPick: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, backgroundColor: c.primarySoft, padding: 4, borderRadius: 14 }}>
      {opts.map((o) => {
        const on = cur === o.value;
        return (
          <Press
            key={o.value}
            onPress={() => onPick(o.value)}
            role="radio"
            label={o.a11y}
            state={{ selected: on, checked: on }}
            style={{
              flexGrow: 1, flexShrink: 1, flexBasis: opts.length > 3 ? 76 : 0, minWidth: 0, minHeight: 44, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 6,
              backgroundColor: on ? c.card : "transparent",
              boxShadow: on ? "0 1px 3px rgba(0,0,0,.14)" : undefined,
              transitionProperty: "backgroundColor", transitionDuration: 200,
            } as ViewStyle}
          >
            <T s={0.92} w={700} c={c.primaryInk} align="center" lh={1.2}>{o.label}</T>
          </Press>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- settings-style rows
export function SIc({ name, red }: { name: string; red?: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: red ? c.dangerSoft : c.primarySoft, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={22} color={red ? c.danger : c.primaryInk} stroke={1.9} />
    </View>
  );
}

export function SRow({ icon, title, sub, onPress, first, chev = true, label }: { icon?: string; title: string; sub?: string; onPress?: () => void; first?: boolean; chev?: boolean; label?: string }) {
  const c = useColors();
  const body = (
    <>
      {icon ? <SIc name={icon} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700}>{title}</T>
        {sub ? <T s={0.84} c="muted" lh={1.35}>{sub}</T> : null}
      </View>
      {chev ? <Icon name="chev" size={20} color={c.muted} stroke={2.2} /> : null}
    </>
  );
  const st: ViewStyle = {
    flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, padding: 10,
    borderTopWidth: first ? 0 : 1, borderTopColor: c.line,
  };
  if (!onPress) return <View style={st}>{body}</View>;
  return <Press onPress={onPress} label={label ?? title} scaleTo={0.985} style={st}>{body}</Press>;
}

export function Switch({ on }: { on: boolean }) {
  const c = useColors();
  return (
    <Animated.View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? c.primary : c.line, transitionProperty: "backgroundColor", transitionDuration: 220, transitionTimingFunction: EASE_OUT }}>
      <Animated.View
        style={{
          position: "absolute", top: 3, left: 3, width: 26, height: 26, borderRadius: 13, backgroundColor: "#FFFFFF",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)", transform: [{ translateX: on ? 20 : 0 }],
          transitionProperty: "transform", transitionDuration: 220, transitionTimingFunction: EASE_OUT,
        }}
      />
    </Animated.View>
  );
}

/** Selectable row with an animated tick. */
export function LRow({ on, first, onPress, children, a11y }: { on: boolean; first?: boolean; onPress: () => void; children: ReactNode; a11y?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: on, selected: on }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12,
        borderTopWidth: first ? 0 : 1, borderTopColor: c.line, backgroundColor: pressed ? c.primarySoft : "transparent",
      })}
    >
      <View style={{ flex: 1 }}>{children}</View>
      <Animated.View
        style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
          opacity: on ? 1 : 0, transform: [{ scale: on ? 1 : 0.6 }],
          transitionProperty: ["opacity", "transform"], transitionDuration: [200, 250], transitionTimingFunction: EASE_OUT,
        }}
      >
        <Icon name="check" size={15} color={c.onPrimary} stroke={3} />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- page text helpers
export function Lead({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: -8 }}><T c="muted">{children}</T></View>;
}

export function Err({ text }: { text: string }) {
  const c = useColors();
  if (!text) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.dangerSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
      <T s={0.92} w={600} c={c.danger}>{text}</T>
    </View>
  );
}

/** Tiny uppercase label next to a name (e.g. today's pickup, primary contact). */
export function Tag({ kind = "yes", icon, children }: { kind?: "yes" | "gold"; icon?: string; children: ReactNode }) {
  const c = useColors();
  const bg = kind === "gold" ? c.warning : c.primarySoft;
  const fg = kind === "gold" ? c.warningInk : c.primaryInk;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
      {icon ? <Icon name={icon} size={11} color={fg} stroke={2.2} /> : null}
      <T s={0.62} w={800} ls={0.04} c={fg} lh={1.2}>{children}</T>
    </View>
  );
}

/** Compact action button used inside list rows (rounded rectangle, 44pt tall). */
export function SmallBtn({
  tone = "off", icon, onPress, label, hint, role = "button", checked, children,
}: {
  tone?: "off" | "on" | "gold" | "danger";
  icon?: string;
  onPress: () => void;
  label?: string;
  hint?: string;
  role?: "button" | "switch";
  checked?: boolean;
  children: ReactNode;
}) {
  const c = useColors();
  let bg = c.card;
  let fg = c.muted;
  let border: string = c.line;
  if (tone === "on") { bg = c.primarySoft; fg = c.primaryInk; border = c.primarySoft; }
  if (tone === "gold") { bg = c.warning; fg = c.warningInk; border = c.warning; }
  if (tone === "danger") { bg = c.dangerSoft; fg = c.danger; border = c.dangerSoft; }
  return (
    <Press
      onPress={onPress}
      role={role}
      label={label}
      hint={hint}
      state={role === "switch" ? { checked: !!checked } : undefined}
      style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: border, backgroundColor: bg }}
    >
      {icon ? <Icon name={icon} size={16} color={fg} stroke={2} /> : null}
      <T s={0.85} w={700} c={fg} lh={1.2}>{children}</T>
    </Press>
  );
}
