import { useState } from "react";
import { View } from "react-native";

import { emptyChildDraft, validateChildDraft, type ChildDraft, type StepErrors } from "../shared/accountRules";
import { FormField } from "../shared/forms";
import type { HChild } from "../shared/householdApi";
import { Btn, Err, Input, T } from "../shared/ui";

export const draftFromChild = (c: HChild): ChildDraft => ({
  name: c.name, age: c.age === null ? "" : String(c.age), className: c.className, schoolName: c.schoolName,
  schoolAddress: c.schoolAddress, teacherName: c.teacherName, teacherPhone: c.teacherPhone,
});

/**
 * Child profile: only what a pickup needs. The school address is what Today uses to find the school on the map when
 * no exact location is saved. Used by onboarding and by Settings, so there is one form to keep correct.
 */
export function ChildForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: ChildDraft;
  submitLabel: string;
  onSubmit: (d: ChildDraft) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<ChildDraft>(initial ?? emptyChildDraft());
  const [errors, setErrors] = useState<StepErrors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (k: keyof ChildDraft, v: string) => {
    setD((cur) => ({ ...cur, [k]: v }));
    if (errors[k]) setErrors((e) => { const { [k]: _x, ...rest } = e; return rest; });
  };
  const submit = async () => {
    if (busy) return;
    const e = validateChildDraft(d);
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
      <FormField label="Child's name" required error={errors.name}>
        <Input value={d.name} onChangeText={(v) => set("name", v)} placeholder="First name" autoCapitalize="words" returnKeyType="next" accessibilityLabel="Child's name" />
      </FormField>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <FormField label="Age" optional error={errors.age}>
            <Input value={d.age} onChangeText={(v) => set("age", v.replace(/\D/g, "").slice(0, 2))} placeholder="8" keyboardType="number-pad" accessibilityLabel="Child's age" />
          </FormField>
        </View>
        <View style={{ flex: 2 }}>
          <FormField label="Class" optional error={errors.className}>
            <Input value={d.className} onChangeText={(v) => set("className", v)} placeholder="2 Amanah" returnKeyType="next" accessibilityLabel="Class" />
          </FormField>
        </View>
      </View>
      <FormField label="School name" required error={errors.schoolName}>
        <Input value={d.schoolName} onChangeText={(v) => set("schoolName", v)} placeholder="School name" autoCapitalize="words" returnKeyType="next" accessibilityLabel="School name" />
      </FormField>
      <FormField label="School address" optional hint="Helps SafeNest find the school for travel times." error={errors.schoolAddress}>
        <Input value={d.schoolAddress} onChangeText={(v) => set("schoolAddress", v)} placeholder="Street, town" autoCapitalize="words" returnKeyType="next" accessibilityLabel="School address" />
      </FormField>
      <FormField label="Class teacher" optional error={errors.teacherName}>
        <Input value={d.teacherName} onChangeText={(v) => set("teacherName", v)} placeholder="Cikgu ..." autoCapitalize="words" returnKeyType="next" accessibilityLabel="Class teacher" />
      </FormField>
      <FormField label="Teacher's phone" optional hint="Used to open a message to the teacher. SafeNest never sends it for you." error={errors.teacherPhone}>
        <Input value={d.teacherPhone} onChangeText={(v) => set("teacherPhone", v)} placeholder="012-345 6789" keyboardType="phone-pad" accessibilityLabel="Teacher's phone" />
      </FormField>
      <T s={0.8} c="muted" lh={1.4}>SafeNest does not ask for a photo, ID number or birth date for your child.</T>
      <Err text={formError} />
      <View style={{ gap: 10 }}>
        <Btn onPress={() => void submit()} loading={busy} label={submitLabel}>{submitLabel}</Btn>
        {onCancel ? <Btn kind="o" onPress={onCancel} disabled={busy} label="Cancel">Cancel</Btn> : null}
      </View>
    </View>
  );
}
