import { useState } from "react";
import { Platform, Share, View } from "react-native";

import { Btn, T, useColors } from "../shared/ui";

/**
 * Shows a one-time join code and lets the parent send it with their own messaging app. SafeNest does not email or
 * text anyone: there is no mail or SMS service behind it, so the invitation only works once the other person has
 * received this code and typed it in after creating their own account.
 */
export function ShareCode({ code, who, kind }: { code: string; who: string; kind: "helper" | "family" }) {
  const c = useColors();
  const [note, setNote] = useState("");
  const message = `Join ${kind === "family" ? "our family" : "my Trusted Circle"} on SafeNest. Create your account, choose "Enter an invite code", and paste this code:\n\n${code}\n\nIt works once and expires in 7 days.`;
  const share = async () => {
    setNote("");
    try {
      if (Platform.OS === "web") {
        const nav = (globalThis as { navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } } }).navigator;
        if (nav?.clipboard) {
          await nav.clipboard.writeText(message);
          setNote("Copied. Paste it into a message.");
          return;
        }
        setNote("Select the code above and copy it.");
        return;
      }
      await Share.share({ message });
    } catch {
      setNote("Could not open sharing. Copy the code above instead.");
    }
  };
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.line }}>
      <T s={0.86} c="muted">Code for {who}</T>
      <T selectable s={0.9} w={700} lh={1.4} style={{ letterSpacing: 0.4 }}>{code}</T>
      <Btn kind="s" sm onPress={() => void share()} label={`Share the code for ${who}`}>Share code</Btn>
      {note ? <T s={0.84} c="muted">{note}</T> : null}
      <T s={0.8} c="muted" lh={1.4}>SafeNest does not send this for you. Only send it to {who}.</T>
    </View>
  );
}
