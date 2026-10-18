import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../shared/AuthContext";
import { useAppContext } from "../shared/AppContext";
import { Field, Input, Press, T } from "../shared/ui";

const LOGO = require("../../../assets/images/logo.png");

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const { theme } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(false);

  const submit = async () => {
    setError("");
    setConfirmation(false);
    if (isSignUp && !fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = isSignUp
        ? await signUp(fullName.trim(), email.trim(), password)
        : await signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
      } else if ("needsConfirmation" in result && result.needsConfirmation) {
        setConfirmation(true);
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp((current) => !current);
    setError("");
    setConfirmation(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: Math.max(28, insets.top + 16),
            paddingBottom: Math.max(28, insets.bottom + 16),
            paddingHorizontal: 24,
          }}
        >
          <Image
            source={LOGO}
            style={{ width: 72, height: 72, borderRadius: 36 }}
            accessibilityLabel="SafeNest"
          />
          <View style={{ marginTop: 14 }}>
            <T s={1.9} w={800} ls={-0.03} lh={1.15} align="center">
              {isSignUp ? "Create your account" : "Welcome to SafeNest"}
            </T>
          </View>
          <View style={{ marginTop: 6, marginBottom: 28 }}>
            <T c="muted" align="center">
              {isSignUp ? "Set up your family account." : "Log in to your family account."}
            </T>
          </View>

          <View
            style={{
              width: "100%",
              maxWidth: 440,
              gap: 18,
              padding: 22,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 24,
              backgroundColor: c.card,
              boxShadow: theme.colors.shadow,
            }}
          >
            {isSignUp ? (
              <Field label="Full name">
                <Input
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                />
              </Field>
            ) : null}
            <Field label="Email">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCorrect={false}
                returnKeyType="next"
              />
            </Field>
            <Field label="Password">
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignUp ? "new-password" : "password"}
                textContentType={isSignUp ? "newPassword" : "password"}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
              />
            </Field>

            {error ? (
              <T c={c.danger} s={0.92}>
                {error}
              </T>
            ) : null}
            {confirmation ? (
              <T c={c.primaryInk} s={0.92}>
                Check your email to confirm your account.
              </T>
            ) : null}

            <Press
              onPress={() => void submit()}
              disabled={busy}
              state={{ disabled: busy, busy }}
              label={isSignUp ? "Create account" : "Log in"}
              style={{
                minHeight: 54,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                borderRadius: 16,
                backgroundColor: c.primary,
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? <ActivityIndicator color={c.onPrimary} /> : null}
              <T c={c.onPrimary} w={700} s={1.02}>
                {busy ? "Please wait..." : isSignUp ? "Create account" : "Log in"}
              </T>
            </Press>

            <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }}>
              <T c="muted" s={0.92}>
                {isSignUp ? "Already have an account? " : "New to SafeNest? "}
              </T>
              <Press onPress={toggleMode} disabled={busy} role="link">
                <T c={c.primaryInk} w={700} s={0.92}>
                  {isSignUp ? "Log in" : "Create account"}
                </T>
              </Press>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
