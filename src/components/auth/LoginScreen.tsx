import { useRef, useState } from "react";
import { View } from "react-native";

import { useAuth } from "../shared/AuthContext";
import { checkEmail } from "../shared/accountRules";
import { FormField, PasswordInput } from "../shared/forms";
import { requestPasswordReset } from "../shared/profileApi";
import { Banner, Btn, Err, Input, Press, T, useColors } from "../shared/ui";
import { AuthFrame } from "./AuthFrame";
import { SignupFlow } from "./SignupFlow";

type Mode = "login" | "signup" | "forgot";

export function LoginScreen() {
  const { signIn, enterDemo } = useAuth();
  const c = useColors();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const submitting = useRef(false);

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setSent(false);
  };

  const login = async () => {
    if (submitting.current) return;
    setError("");
    const emailErr = checkEmail(email);
    if (emailErr) return setError(emailErr);
    if (!password) return setError("Enter your password.");
    submitting.current = true;
    setBusy(true);
    try {
      const res = await signIn(email.trim(), password);
      if (res.error) setError(res.error);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (submitting.current) return;
    setError("");
    submitting.current = true;
    setBusy(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.ok) setSent(true);
      else setError(res.error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (mode === "signup") return <SignupFlow onBackToLogin={() => go("login")} />;

  if (mode === "forgot") {
    return (
      <AuthFrame title="Reset your password" subtitle="We will email you a link if this address has an account.">
        <FormField label="Email" required>
          <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => void sendReset()} />
        </FormField>
        <Err text={error} />
        {sent ? <Banner kind="ok">If that address has a SafeNest account, a reset link is on its way. Open it on this phone.</Banner> : null}
        <Btn onPress={() => void sendReset()} loading={busy} label="Send reset link">Send reset link</Btn>
        <T s={0.8} c="muted" lh={1.4} align="center">Reset emails only arrive if your team has email sending set up in Supabase.</T>
        <Press onPress={() => go("login")} role="link" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}>
          <T c={c.primaryInk} w={700} s={0.92}>Back to log in</T>
        </Press>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Welcome to SafeNest"
      subtitle="Log in to your family account."
      footer={
        <>
          <Btn kind="o" onPress={enterDemo} label="Explore the demo with sample data">Explore the demo</Btn>
          <T s={0.8} c="muted" align="center" lh={1.4}>Demo Mode uses made-up people. Nothing is saved and nobody is contacted.</T>
        </>
      }
    >
      <FormField label="Email">
        <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" autoCorrect={false} returnKeyType="next" />
      </FormField>
      <FormField label="Password">
        <PasswordInput value={password} onChangeText={setPassword} placeholder="Your password" autoComplete="password" textContentType="password" returnKeyType="done" onSubmitEditing={() => void login()} />
      </FormField>
      <Press onPress={() => go("forgot")} role="link" style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
        <T c={c.primaryInk} w={700} s={0.88}>Forgot password?</T>
      </Press>
      <Err text={error} />
      <Btn onPress={() => void login()} loading={busy} label="Log in">{busy ? "Please wait..." : "Log in"}</Btn>
      <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }}>
        <T c="muted" s={0.92}>New to SafeNest? </T>
        <Press onPress={() => go("signup")} disabled={busy} role="link" style={{ minHeight: 24 }}>
          <T c={c.primaryInk} w={700} s={0.92}>Create account</T>
        </Press>
      </View>
    </AuthFrame>
  );
}
