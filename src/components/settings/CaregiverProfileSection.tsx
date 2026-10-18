import { useState } from "react";
import { View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { useAppContext } from "../shared/AppContext";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Disclosure } from "../shared/Disclosure";
import { Sheet } from "../shared/Sheet";
import { isValidEmail, isValidPhone, saveProfileEdit, useProfileEdits } from "../shared/profileEdits";
import { Banner, Btn, Dl, Err, Field, Input, Row, T } from "../shared/ui";

export function CaregiverProfileSection() {
  const { theme, selectedCaregiver } = useAppContext();
  const c = theme.colors;
  const edits = useProfileEdits();
  const base = selectedCaregiver;
  const caregiver = base ? { ...base, ...edits[base.id] } : null;
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const openEdit = () => {
    if (!caregiver) return;
    setPhone(caregiver.phone);
    setEmail(caregiver.email);
    setError("");
    setEditing(true);
  };
  const save = () => {
    if (!base) return;
    if (!isValidPhone(phone)) return setError("Enter a phone number with digits, for example +60 12-345 6789.");
    if (!isValidEmail(email)) return setError("Enter an email address like name@example.com.");
    saveProfileEdit(base.id, { phone: phone.trim(), email: email.trim() });
    setEditing(false);
    setSaved("Contact details updated for this demo session.");
  };

  if (!base || !caregiver) return null;
  
  return (
    <>
      <SectionHeading title="Your profile" />
      <Card>
        <Row first style={{ paddingTop: 0, paddingBottom: 6, gap: 16 }}>
          <Avatar name={caregiver.name} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.3} w={800} ls={-0.01}>{caregiver.name}</T>
            <T s={0.88} w={700} c={c.primaryInk}>{caregiver.role}{caregiver.isAdmin ? " · Admin" : ""}</T>
            <T s={0.88} c="muted">{caregiver.email}</T>
          </View>
        </Row>
        <Dl k="Phone" v={caregiver.phone} />
        <View style={{ marginTop: 10, gap: 10 }}>
          {saved ? <Banner key={saved} kind="ok">{saved}</Banner> : null}
          <Btn kind="s" sm icon="me" onPress={openEdit} label="Edit contact details">Edit contact details</Btn>
          <T s={0.78} lh={1.4} c="muted">Contact edits stay in app memory and are not saved to your account.</T>
        </View>
      </Card>

      <Disclosure title="Emergency contact" sub="None listed">
        <T s={0.88} c="muted">No emergency contact is listed.</T>
      </Disclosure>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit contact details" closeLabel="Close edit contact details">
        <T c="muted" lh={1.4}>Update how {base.name} appears in this demo. Nothing is sent anywhere.</T>
        <Field label="Phone number">
          <Input accessibilityLabel="Phone number" keyboardType="phone-pad" value={phone} onChangeText={(v: string) => { setPhone(v); setError(""); }} />
        </Field>
        <Field label="Email">
          <Input accessibilityLabel="Email address" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(v: string) => { setEmail(v); setError(""); }} />
        </Field>
        <Err text={error} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Btn kind="o" flex onPress={() => setEditing(false)}>Cancel</Btn>
          <Btn kind="p" flex icon="check" onPress={save}>Save details</Btn>
        </View>
      </Sheet>
    </>
  );
}
