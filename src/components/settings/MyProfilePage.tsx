import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import {
  GENDERS, LANGUAGES, RELATIONSHIPS, accountTypeLabel, checkDob, checkFullName, checkPhone, displayDob, genderLabel,
  languageLabel, normalizePhone, parseDob, type Dob, type Gender, type Language,
} from "../shared/accountRules";
import { ChipChoice, DobField, FormField } from "../shared/forms";
import { Banner, Btn, Chip, Dl, Err, Input, T } from "../shared/ui";

const REL = RELATIONSHIPS.map((r) => ({ value: r, label: r }));
const splitIso = (iso: string | null): Dob => {
  if (!iso) return { day: "", month: "", year: "" };
  const [y, m, d] = iso.split("-");
  return { day: d, month: m, year: y };
};
const memberSince = (iso: string | null) => {
  if (!iso) return "Not available";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Not available" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

/** The signed-in person's real profile. Nothing here is hard coded: it is whatever this account saved. */
export function MyProfilePage() {
  const { profile, updateProfile, session, demo, caregiver } = useAuth();
  const household = useHousehold();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState<Dob>({ day: "", month: "", year: "" });
  const [gender, setGender] = useState<Gender | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [relationship, setRelationship] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const uid = session?.user.id ?? null;

  useEffect(() => {
    if (!uid) return;
    void AsyncStorage.getItem(`safenest:photo:${uid}`).then((v) => setPhoto(v)).catch(() => {});
  }, [uid]);

  if (demo || !profile) {
    return (
      <Card>
        <T w={800}>{caregiver?.name ?? "Demo parent"}</T>
        <T s={0.9} c="muted" lh={1.4}>Demo Mode uses a made-up profile. Create an account to have a real one.</T>
      </Card>
    );
  }

  const open = () => {
    setName(profile.fullName);
    setPhone(profile.phone);
    setDob(splitIso(profile.dateOfBirth));
    setGender(profile.gender);
    setLanguage(profile.language);
    setRelationship(profile.relationship);
    setErrors({});
    setFormError("");
    setSaved(false);
    setEditing(true);
  };

  const save = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    const n = checkFullName(name);
    if (n) e.name = n;
    const p = checkPhone(phone, true);
    if (p) e.phone = p;
    // Date of birth is only re-checked if it is being changed, so an older account is not locked out of editing.
    const dobChanged = profile.dateOfBirth !== (parseDob(dob)?.iso ?? null);
    if (dobChanged || !profile.dateOfBirth) {
      const d = checkDob(dob);
      if (d) e.dob = d;
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError("");
    const res = await updateProfile({
      fullName: name.trim().replace(/\s+/g, " "), phone: normalizePhone(phone), dateOfBirth: parseDob(dob)?.iso ?? profile.dateOfBirth,
      gender, language, relationship,
    });
    setBusy(false);
    if (!res.ok) return setFormError(res.error);
    setEditing(false);
    setSaved(true);
  };

  const choosePhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      const uri = r.assets?.[0]?.uri;
      if (r.canceled || !uri || !uid) return;
      setPhoto(uri);
      await AsyncStorage.setItem(`safenest:photo:${uid}`, uri);
    } catch {
      // ignore: the initials avatar stays
    }
  };

  const isParent = profile.accountType === "parent";
  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar name={profile.fullName || profile.email} imageUri={photo ?? undefined} size={88} />
        <T s={1.25} w={800} align="center" lh={1.3}>{profile.fullName || "No name yet"}</T>
        <Chip kind="plain">{accountTypeLabel(profile.accountType)}</Chip>
        <Btn kind="s" sm icon="camera" onPress={() => void choosePhoto()} label="Choose a profile photo">Choose photo</Btn>
        <T s={0.78} c="muted" align="center">The photo stays on this phone. Other people see your initials.</T>
      </View>

      {saved ? <Banner kind="ok">Your changes were saved.</Banner> : null}

      <SectionHeading title="Personal details" />
      <Card tight>
        <Dl first k="Full name" v={profile.fullName || "Not set"} />
        <Dl k="Phone number" v={profile.phone || "Not set"} />
        <Dl k="Date of birth" v={displayDob(profile.dateOfBirth)} />
        <Dl k="Gender" v={genderLabel(profile.gender)} />
        <Dl k="Preferred language" v={languageLabel(profile.language)} />
        {isParent ? <Dl k="Relationship to child" v={profile.relationship || "Not set"} /> : null}
      </Card>
      <Btn onPress={open} icon="me" label="Edit personal details">Edit details</Btn>

      <SectionHeading title="Account" />
      <Card tight>
        <Dl first k="Email" v={profile.email} />
        <Dl k="Account type" v={accountTypeLabel(profile.accountType)} />
        <Dl k="Household" v={household.familyName || "Not available"} />
        <Dl k="Member since" v={memberSince(profile.createdAt)} />
      </Card>
      <T s={0.82} c="muted" lh={1.4}>Change your email or password under Password and security. Your account type cannot be changed here.</T>
      {profile.metadataOnly ? (
        <T s={0.78} c="muted" lh={1.4}>Date of birth, gender and language are saved with your sign-in for now. They move to your profile once the team applies supabase/account_household.sql.</T>
      ) : null}

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Edit details"
        closeLabel="Close edit details"
        footer={<View style={{ gap: 10 }}><Err text={formError} /><Btn onPress={() => void save()} loading={busy} icon="check" label="Save changes">Save changes</Btn></View>}
      >
        <FormField label="Full name" required error={errors.name}>
          <Input value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" accessibilityLabel="Full name" />
        </FormField>
        <FormField label="Phone number" required error={errors.phone}>
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Phone number" />
        </FormField>
        <DobField value={dob} onChange={setDob} error={errors.dob} />
        <FormField label="Gender" optional>
          <ChipChoice label="Gender" options={GENDERS} value={gender} onChange={setGender} />
        </FormField>
        <FormField label="Preferred language">
          <ChipChoice label="Preferred language" options={LANGUAGES} value={language} onChange={setLanguage} />
        </FormField>
        {isParent ? (
          <FormField label="Relationship to your child" optional>
            <ChipChoice label="Relationship to your child" options={REL} value={(relationship || null) as (typeof RELATIONSHIPS)[number] | null} onChange={setRelationship} />
          </FormField>
        ) : null}
      </Sheet>
    </View>
  );
}
