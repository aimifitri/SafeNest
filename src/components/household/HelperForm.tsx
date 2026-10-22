import { useState } from "react";
import { View } from "react-native";

import { RELATIONSHIPS, emptyHelperDraft, validateHelperDraft, type HelperDraft, type StepErrors } from "../shared/accountRules";
import { ChipChoice, FormField } from "../shared/forms";
import { Btn, Err, Input, LRow, T, useColors } from "../shared/ui";

const REL_OPTIONS = RELATIONSHIPS.map((r) => ({ value: r, label: r }));

/**
 * Adds someone to the Trusted Circle as PENDING. Being related to the child does not approve anyone: a guardian does
 * that on the next step. Everyone must confirm they are an adult, since a helper may collect a child.
 */
export function HelperForm({ submitLabel = "Add to Trusted Circle", onSubmit, onCancel }: { submitLabel?: string; onSubmit: (d: HelperDraft) => Promise<string | null>; onCancel?: () => void }) {
  const c = useColors();
  const [d, setD] = useState<HelperDraft>(emptyHelperDraft());
  const [errors, setErrors] = useState<StepErrors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const set = <K extends keyof HelperDraft>(k: K, v: HelperDraft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }));
    if (errors[k]) setErrors((e) => { const { [k as string]: _x, ...rest } = e; return rest; });
  };
  const submit = async () => {
    if (busy) return;
    const e = validateHelperDraft(d);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError("");
    const err = await onSubmit(d);
    setBusy(false);
    if (err) setFormError(err);
  };
  return (
    <View style={{ gap: 16 }}>
      <FormField label="Name" required error={errors.name}>
        <Input value={d.name} onChangeText={(v) => set("name", v)} placeholder="Full name" autoCapitalize="words" returnKeyType="next" accessibilityLabel="Helper name" />
      </FormField>
      <FormField label="Relationship to your child" required error={errors.relationship}>
        <ChipChoice label="Relationship to your child" options={REL_OPTIONS} value={(d.relationship || null) as (typeof RELATIONSHIPS)[number] | null} onChange={(v) => set("relationship", v)} />
      </FormField>
      <FormField label="Phone number" optional error={errors.phone}>
        <Input value={d.phone} onChangeText={(v) => set("phone", v)} placeholder="+60 12-345 6789" keyboardType="phone-pad" accessibilityLabel="Helper phone number" />
      </FormField>
      <View>
        <LRow on={d.isAdult} first onPress={() => set("isAdult", !d.isAdult)} a11y="This person is 18 or older">
          <T w={600} lh={1.3}>This person is 18 or older</T>
        </LRow>
        {errors.isAdult ? <T s={0.84} w={600} c={c.danger}>{errors.isAdult}</T> : null}
      </View>
      <T s={0.82} c="muted" lh={1.4}>They start as pending. Being family does not approve them. You approve each person yourself, and the teacher still checks who arrives.</T>
      <Err text={formError} />
      <View style={{ gap: 10 }}>
        <Btn onPress={() => void submit()} loading={busy} label={submitLabel}>{submitLabel}</Btn>
        {onCancel ? <Btn kind="o" onPress={onCancel} disabled={busy} label="Cancel">Cancel</Btn> : null}
      </View>
    </View>
  );
}
