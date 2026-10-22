import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "../shared/AuthContext";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { FormField, PasswordInput, StrengthMeter } from "../shared/forms";
import { changePassword, requestEmailChange, requestPasswordReset } from "../shared/profileApi";
import { Banner, Btn, Err, Input, T, useColors } from "../shared/ui";

/**
 * Password and email. Both ask for the current password first (a fresh sign-in check) because a stolen, unlocked phone
 * should not be enough to take over the account. SafeNest never shows or stores your password.
 */
export function SecurityPage() {
  const colors = useColors();
  const { profile, demo } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwDone, setPwDone] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emBusy, setEmBusy] = useState(false);
  const [emError, setEmError] = useState("");
  const [emDone, setEmDone] = useState(false);

  const [resetMsg, setResetMsg] = useState("");

  if (demo || !profile) {
    return <Card><T w={700}>Demo Mode</T><T s={0.9} c="muted" lh={1.4}>Passwords and email belong to real accounts. Create an account to manage them.</T></Card>;
  }

  const doPassword = async () => {
    if (pwBusy) return;
    setPwBusy(true);
    setPwError("");
    setPwDone(false);
    const res = await changePassword(profile.email, current, next, confirm);
    setPwBusy(false);
    if (!res.ok) return setPwError(res.error);
    setCurrent("");
    setNext("");
    setConfirm("");
    setPwDone(true);
  };

  const doEmail = async () => {
    if (emBusy) return;
    setEmBusy(true);
    setEmError("");
    setEmDone(false);
    const res = await requestEmailChange(profile.email, emailPw, newEmail);
    setEmBusy(false);
    if (!res.ok) return setEmError(res.error);
    setEmailPw("");
    setEmDone(true);
  };

  const doReset = async () => {
    const res = await requestPasswordReset(profile.email);
    setResetMsg(res.ok ? "If email sending is set up for this project, a reset link is on its way." : res.error);
  };

  return (
    <View style={{ gap: 16 }}>
      <SectionHeading title="Change password" />
      <Card>
        <View style={{ gap: 14 }}>
          <FormField label="Current password" required>
            <PasswordInput fieldName="current password" value={current} onChangeText={setCurrent} autoComplete="current-password" textContentType="password" />
          </FormField>
          <FormField label="New password" required>
            <PasswordInput fieldName="new password" value={next} onChangeText={setNext} autoComplete="new-password" textContentType="newPassword" />
          </FormField>
          <StrengthMeter password={next} />
          <FormField label="Confirm new password" required>
            <PasswordInput fieldName="confirm new password" value={confirm} onChangeText={setConfirm} autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={() => void doPassword()} />
          </FormField>
          <Err text={pwError} />
          {pwDone ? <Banner kind="ok">Password changed.</Banner> : null}
          <Btn onPress={() => void doPassword()} loading={pwBusy} icon="key" label="Change password">Change password</Btn>
          <Btn kind="t" color={colors.primaryInk} onPress={() => void doReset()} label="Email me a reset link instead">Forgot it? Email me a reset link</Btn>
          {resetMsg ? <T s={0.84} c="muted">{resetMsg}</T> : null}
        </View>
      </Card>

      <SectionHeading title="Change email" />
      <Card>
        <View style={{ gap: 14 }}>
          <T s={0.9} c="muted" lh={1.4}>Current email: {profile.email}</T>
          <FormField label="New email" required>
            <Input value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" accessibilityLabel="New email address" />
          </FormField>
          <FormField label="Current password" required hint="Needed to confirm it is you.">
            <PasswordInput fieldName="password for email change" value={emailPw} onChangeText={setEmailPw} autoComplete="current-password" textContentType="password" returnKeyType="done" onSubmitEditing={() => void doEmail()} />
          </FormField>
          <Err text={emError} />
          {emDone ? <Banner kind="ok">We sent a confirmation link to the new address. Your email changes only after you open it.</Banner> : null}
          <Btn kind="o" onPress={() => void doEmail()} loading={emBusy} icon="mail" label="Change email">Change email</Btn>
        </View>
      </Card>
    </View>
  );
}
