import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppContext } from "../shared/AppContext";
import { T } from "../shared/ui";

const LOGO = require("../../../assets/images/logo.png");

/** Shared page frame for log in, sign up and recovery: logo, title, a card, keyboard-safe scrolling. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          <Image source={LOGO} style={{ width: 72, height: 72, borderRadius: 36 }} accessibilityLabel="SafeNest" />
          <View style={{ marginTop: 14 }}>
            <T s={1.9} w={800} ls={-0.03} lh={1.15} align="center">{title}</T>
          </View>
          {subtitle ? (
            <View style={{ marginTop: 6, marginBottom: 24 }}>
              <T c="muted" align="center">{subtitle}</T>
            </View>
          ) : <View style={{ height: 24 }} />}
          <View
            style={{
              width: "100%", maxWidth: 440, gap: 18, padding: 22, borderWidth: 1, borderColor: c.line,
              borderRadius: 24, backgroundColor: c.card, boxShadow: c.shadow,
            }}
          >
            {children}
          </View>
          {footer ? <View style={{ marginTop: 18, width: "100%", maxWidth: 440, gap: 12 }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
