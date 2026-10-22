import { forwardRef, useState } from "react";
import type { ReactNode } from "react";
import { TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";

import { Icon } from "../navigation/Icon";
import { passwordStrength } from "./accountRules";
import { Field, Input, Press, Switch, T, useColors } from "./ui";

// Small form pieces shared by sign-up, onboarding, My Profile and Security.

/** A labelled field with "Required"/"Optional" and an inline message under it. */
export function FormField({ label, required, optional, hint, error, children }: { label: string; required?: boolean; optional?: boolean; hint?: string; error?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <T s={0.9} w={600} style={{ flexShrink: 1 }}>{label}</T>
        {required ? <T s={0.74} w={600} c={c.muted}>Required</T> : optional ? <T s={0.74} w={600} c={c.muted}>Optional</T> : null}
      </View>
      {children}
      {error ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
          <T s={0.84} w={600} c={c.danger} lh={1.35}>{error}</T>
        </View>
      ) : hint ? (
        <T s={0.82} c="muted" lh={1.35}>{hint}</T>
      ) : null}
    </View>
  );
}

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "style"> & {
  /** Accessible name for the eye button's field, e.g. "password" or "confirm password". */
  fieldName?: string;
};

/**
 * Password field with a show/hide eye on the right. Hidden by default. Each instance keeps its own state, so a
 * password and its confirmation are revealed independently. The value is never stored or logged here.
 */
export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput({ fieldName = "password", ...rest }, ref) {
  const c = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ position: "relative", width: "100%" }}>
      <Input
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        {...rest}
        secureTextEntry={!shown}
        style={{ paddingRight: 52 }}
      />
      <Press
        onPress={() => setShown((v) => !v)}
        label={shown ? `Hide ${fieldName}` : `Show ${fieldName}`}
        role="button"
        state={{ checked: shown }}
        scaleTo={0.92}
        hitSlop={6}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 52, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name={shown ? "eyeoff" : "eye"} size={22} color={c.muted} stroke={1.9} />
      </Press>
    </View>
  );
});

/** Four-segment strength meter. Guidance only: the rules are checked separately. */
export function StrengthMeter({ password }: { password: string }) {
  const c = useColors();
  if (!password) return null;
  const s = passwordStrength(password);
  const colour = s.score <= 1 ? c.danger : s.score === 2 ? c.warningInk : c.success;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`Password strength: ${s.label}`}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= s.score ? colour : c.line }} />
        ))}
      </View>
      <T s={0.82} w={600} c={colour}>{s.label}{s.missing.length ? `. Add ${s.missing.join(", ")}.` : ""}</T>
    </View>
  );
}

/** Step dots for multi-step flows: "Step 2 of 3". */
export function StepProgress({ step, total, labels }: { step: number; total: number; labels?: string[] }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`Step ${step + 1} of ${total}${labels?.[step] ? `: ${labels[step]}` : ""}`}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? c.primary : c.line }} />
        ))}
      </View>
      <T s={0.84} w={600} c="muted">Step {step + 1} of {total}{labels?.[step] ? ` · ${labels[step]}` : ""}</T>
    </View>
  );
}

/** One big selectable card (account type, relationship). Selected state is shown by border and a check, not colour alone. */
export function ChoiceCard({ title, description, selected, onPress }: { title: string; description?: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Press
      onPress={onPress}
      role="radio"
      label={title}
      hint={description}
      state={{ selected, checked: selected }}
      style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 14, minHeight: 64, borderRadius: 16, borderWidth: 2, borderColor: selected ? c.primary : c.line, backgroundColor: selected ? c.primarySoft : c.card }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: selected ? c.primary : c.line, alignItems: "center", justifyContent: "center", backgroundColor: selected ? c.primary : "transparent" }}>
        {selected ? <Icon name="check" size={14} color={c.onPrimary} stroke={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T w={700} lh={1.3}>{title}</T>
        {description ? <T s={0.86} c="muted" lh={1.4}>{description}</T> : null}
      </View>
    </Press>
  );
}

/** Wrapping row of small single-choice chips (gender, relationship, language). */
export function ChipChoice<V extends string>({ options, value, onChange, label }: { options: ReadonlyArray<{ value: V; label: string }>; value: V | null; onChange: (v: V) => void; label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            onPress={() => onChange(o.value)}
            role="radio"
            label={o.label}
            state={{ selected: on, checked: on }}
            style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: on ? c.primary : c.line, backgroundColor: on ? c.primarySoft : c.background, alignItems: "center", justifyContent: "center" }}
          >
            <T s={0.92} w={on ? 700 : 600} c={on ? c.primaryInk : c.ink}>{o.label}</T>
          </Press>
        );
      })}
    </View>
  );
}

/**
 * Date of birth as day, month and year boxes. A native calendar wheel needs a package this project does not have, and a
 * typed date with number keypads is faster for a birth year anyway. The month is a number to keep it language-neutral.
 */
export function DobField({ value, onChange, error }: { value: { day: string; month: string; year: string }; onChange: (v: { day: string; month: string; year: string }) => void; error?: string }) {
  const digits = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);
  return (
    <FormField label="Date of birth" required hint="Used only to confirm you are an adult. It is not shown to other people." error={error}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Input accessibilityLabel="Day of birth" placeholder="DD" keyboardType="number-pad" maxLength={2} value={value.day} onChangeText={(t) => onChange({ ...value, day: digits(t, 2) })} />
        </View>
        <View style={{ flex: 2 }}>
          <Input accessibilityLabel="Month of birth" placeholder="MM" keyboardType="number-pad" maxLength={2} value={value.month} onChangeText={(t) => onChange({ ...value, month: digits(t, 2) })} />
        </View>
        <View style={{ flex: 3 }}>
          <Input accessibilityLabel="Year of birth" placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={value.year} onChangeText={(t) => onChange({ ...value, year: digits(t, 4) })} />
        </View>
      </View>
    </FormField>
  );
}

/** Honest empty state: what is missing, why it matters, one clear action. */
export function EmptyState({ icon, title, body, children }: { icon: string; title: string; body: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 24, paddingHorizontal: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={30} color={c.primary} stroke={1.8} />
      </View>
      <T s={1.15} w={800} align="center" lh={1.25}>{title}</T>
      <T c="muted" align="center" lh={1.45}>{body}</T>
      {children ? <View style={{ alignSelf: "stretch", gap: 10, marginTop: 4 }}>{children}</View> : null}
    </View>
  );
}

export { Field };

/** On/off row with a real switch role. Use for settings that take effect when saved. */
export function ToggleRow({ title, sub, on, onChange, first }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const c = useColors();
  return (
    <Press
      onPress={() => onChange(!on)}
      role="switch"
      label={title}
      hint={sub}
      state={{ checked: on }}
      scaleTo={0.99}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T w={700} lh={1.3}>{title}</T>
        {sub ? <T s={0.84} c="muted" lh={1.35}>{sub}</T> : null}
      </View>
      <Switch on={on} />
    </Press>
  );
}

/** A plain day / month / year entry with its own label. Returns an ISO date through `onChange` as three strings. */
export function DateField({ label, value, onChange, error, hint }: { label: string; value: { day: string; month: string; year: string }; onChange: (v: { day: string; month: string; year: string }) => void; error?: string; hint?: string }) {
  const digits = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);
  return (
    <FormField label={label} required hint={hint} error={error}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 2 }}><Input accessibilityLabel={`${label}, day`} placeholder="DD" keyboardType="number-pad" maxLength={2} value={value.day} onChangeText={(t) => onChange({ ...value, day: digits(t, 2) })} /></View>
        <View style={{ flex: 2 }}><Input accessibilityLabel={`${label}, month`} placeholder="MM" keyboardType="number-pad" maxLength={2} value={value.month} onChangeText={(t) => onChange({ ...value, month: digits(t, 2) })} /></View>
        <View style={{ flex: 3 }}><Input accessibilityLabel={`${label}, year`} placeholder="YYYY" keyboardType="number-pad" maxLength={4} value={value.year} onChangeText={(t) => onChange({ ...value, year: digits(t, 4) })} /></View>
      </View>
    </FormField>
  );
}
