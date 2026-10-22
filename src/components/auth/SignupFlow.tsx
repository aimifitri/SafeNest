import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "../shared/AuthContext";
import {
  ACCOUNT_TYPES, GENDERS, LANGUAGES, emptySignup, parseDob, validateSignupStep,
  type SignupDraft, type StepErrors,
} from "../shared/accountRules";
import { ChipChoice, ChoiceCard, DobField, FormField, PasswordInput, StepProgress, StrengthMeter } from "../shared/forms";
import { Banner, Btn, Err, Input, Press, T, useColors } from "../shared/ui";
import { AuthFrame } from "./AuthFrame";

const DRAFT_KEY = "safenest:signupDraft";
const STEPS = ["How you will use SafeNest", "About you", "Choose a password"];

// The draft keeps everything except the passwords, so closing the app mid-way does not lose the typing.
type SavedDraft = { step: number; draft: Omit<SignupDraft, "password" | "confirm"> };

export function SignupFlow({ onBackToLogin }: { onBackToLogin: () => void }) {
  const { signUp } = useAuth();
  const c = useColors();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [d, setD] = useState<SignupDraft>(emptySignup());
  const [errors, setErrors] = useState<StepErrors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState<"" | "confirm">("");
  const submitting = useRef(false);
  const restored = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as SavedDraft;
        if (saved?.draft) {
          setD({ ...emptySignup(), ...saved.draft, password: "", confirm: "" });
          setStep(([0, 1, 2].includes(saved.step) ? Math.min(saved.step, 1) : 0) as 0 | 1);
        }
      })
      .catch(() => {})
      .finally(() => {
        restored.current = true;
      });
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    const { password: _p, confirm: _c, ...safe } = d;
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ step, draft: safe } satisfies SavedDraft)).catch(() => {});
  }, [d, step]);

  const set = <K extends keyof SignupDraft>(k: K, v: SignupDraft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }));
    if (errors[k as string]) setErrors((e) => {
      const { [k as string]: _gone, ...rest } = e;
      return rest;
    });
  };

  const next = () => {
    const e = validateSignupStep(step, d);
    setErrors(e);
    if (Object.keys(e).length) return;
    setFormError("");
    setStep((s) => (Math.min(2, s + 1) as 0 | 1 | 2));
  };

  const back = () => {
    setErrors({});
    setFormError("");
    if (step === 0) onBackToLogin();
    else setStep((s) => (Math.max(0, s - 1) as 0 | 1 | 2));
  };

  const submit = async () => {
    if (submitting.current) return;
    const e = validateSignupStep(2, d);
    setErrors(e);
    if (Object.keys(e).length) return;
    const dob = parseDob(d.dob);
    if (!d.accountType || !dob) {
      setFormError("Some details are missing. Go back and check the earlier steps.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFormError("");
    try {
      const res = await signUp({
        fullName: d.fullName, email: d.email, password: d.password, phone: d.phone.trim(),
        accountType: d.accountType, dateOfBirth: dob.iso, gender: d.gender, language: d.language,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        if (res.needsConfirmation) setDone("confirm");
        // otherwise a session starts and the app moves on by itself.
      }
    } catch {
      setFormError("Unable to connect. Your account was not created. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (done === "confirm") {
    return (
      <AuthFrame title="Check your email" subtitle="Your account is created but not active yet.">
        <Banner kind="ok">We sent a confirmation link to {d.email.trim()}. Open it, then come back and log in.</Banner>
        <T s={0.86} c="muted" lh={1.45}>You will not be signed in until the email is confirmed. If nothing arrives in a few minutes, check spam.</T>
        <Btn onPress={onBackToLogin} label="Go to log in">Go to log in</Btn>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Create your account" subtitle="It takes about two minutes.">
      <StepProgress step={step} total={3} labels={STEPS} />

      {step === 0 ? (
        <View style={{ gap: 12 }}>
          <T w={700}>I am a...</T>
          {ACCOUNT_TYPES.map((t) => (
            <ChoiceCard key={t.value} title={t.label} description={t.description} selected={d.accountType === t.value} onPress={() => set("accountType", t.value)} />
          ))}
          {errors.accountType ? <T s={0.84} w={600} c={c.danger}>{errors.accountType}</T> : null}
          <T s={0.82} c="muted" lh={1.4}>Children do not get their own accounts. A parent or guardian adds a child as a profile after signing up.</T>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: 16 }}>
          <FormField label="Full name" required error={errors.fullName}>
            <Input value={d.fullName} onChangeText={(v) => set("fullName", v)} placeholder="Your name" autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
          </FormField>
          <FormField label="Email" required error={errors.email}>
            <Input value={d.email} onChangeText={(v) => set("email", v)} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false} returnKeyType="next" />
          </FormField>
          <FormField label="Phone number" required error={errors.phone} hint="Helpers and the school may need to reach you.">
            <Input value={d.phone} onChangeText={(v) => set("phone", v)} placeholder="+60 12-345 6789" autoComplete="tel" keyboardType="phone-pad" textContentType="telephoneNumber" returnKeyType="next" />
          </FormField>
          <DobField value={d.dob} onChange={(v) => set("dob", v)} error={errors.dob} />
          <FormField label="Gender" optional>
            <ChipChoice label="Gender" options={GENDERS} value={d.gender} onChange={(v) => set("gender", v)} />
          </FormField>
          <FormField label="Preferred language" hint="Used for messages written for you. The app screens are in English for now.">
            <ChipChoice label="Preferred language" options={LANGUAGES} value={d.language} onChange={(v) => set("language", v)} />
          </FormField>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 16 }}>
          <FormField label="Password" required error={errors.password}>
            <PasswordInput fieldName="password" value={d.password} onChangeText={(v) => set("password", v)} placeholder="At least 8 characters" autoComplete="new-password" textContentType="newPassword" returnKeyType="next" />
          </FormField>
          <StrengthMeter password={d.password} />
          <FormField label="Confirm password" required error={errors.confirm}>
            <PasswordInput fieldName="confirm password" value={d.confirm} onChangeText={(v) => set("confirm", v)} placeholder="Type it again" autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={() => void submit()} />
          </FormField>
          <T s={0.82} c="muted" lh={1.4}>Use at least 8 characters with a letter and a number. A longer phrase is stronger.</T>
        </View>
      ) : null}

      <Err text={formError} />

      <View style={{ gap: 10 }}>
        {step < 2 ? (
          <Btn onPress={next} label="Continue">Continue</Btn>
        ) : (
          <Btn onPress={() => void submit()} loading={busy} label="Create account">{busy ? "Creating account..." : "Create account"}</Btn>
        )}
        <Btn kind="o" onPress={back} disabled={busy} label={step === 0 ? "Back to log in" : "Back"}>{step === 0 ? "Back to log in" : "Back"}</Btn>
      </View>
      {step === 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }}>
          <T c="muted" s={0.92}>Already have an account? </T>
          <Press onPress={onBackToLogin} role="link"><T c={c.primaryInk} w={700} s={0.92}>Log in</T></Press>
        </View>
      ) : null}
    </AuthFrame>
  );
}
