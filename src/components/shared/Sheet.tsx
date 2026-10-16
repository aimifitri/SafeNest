// Bottom sheet from the HTML prototype: scrim fades in (250ms), the sheet rises with the drawer curve (380ms),
// and both stay mounted while the 240ms close animation plays. Used instead of RN's built-in modal animations.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "./AppContext";
import { EASE_DRAWER, EASE_IN_OUT, anim } from "./motion";
import { Press, T } from "./ui";

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  closeLabel?: string;
  children: ReactNode;
  /** Actions that stay pinned under the scrolling content, so Save and Cancel never scroll out of view. */
  footer?: ReactNode;
};

export function Sheet({ visible, onClose, title, closeLabel = "Close", children, footer }: SheetProps) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, reduce ? 0 : 240);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;
  const isClosing = closing || !visible;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View
          style={[
            { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim },
            anim(isClosing ? "fadeout" : "fade", { ms: isClosing ? 220 : 250 }, reduce),
          ]}
        >
          <Pressable accessibilityLabel={closeLabel} style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                width: "100%",
                maxWidth: 640,
                alignSelf: "center",
                maxHeight: "92%",
                backgroundColor: c.background,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingTop: 10,
                paddingBottom: Math.max(18, insets.bottom),
                paddingHorizontal: 16,
                boxShadow: "0 -10px 40px rgba(0,0,0,.25)",
              },
              anim(isClosing ? "down" : "up", { ms: isClosing ? 240 : 380, ease: isClosing ? EASE_IN_OUT : EASE_DRAWER }, reduce),
            ]}
          >
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, alignSelf: "center" }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
              <View accessibilityRole="header" style={{ flex: 1 }}>
                <T s={1.4} w={800} ls={-0.02} lh={1.25}>{title}</T>
              </View>
              <Press
                onPress={onClose}
                label={closeLabel}
                scaleTo={0.92}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="x" size={18} color={c.primaryInk} stroke={2.4} />
              </Press>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ gap: 14, paddingTop: 6, paddingBottom: 4 }}
            >
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingTop: 10 }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
