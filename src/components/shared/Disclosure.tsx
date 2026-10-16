import { useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "./AppContext";
import { Card } from "./Card";
import { Press, Rise, T } from "./ui";

/** Collapsed-by-default section for details that are not needed every visit. */
export function Disclosure({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  return (
    <Card tight>
      <Press
        onPress={() => setOpen((v) => !v)}
        label={`${title}. ${open ? "Hide" : "Show"}`}
        state={{ selected: open }}
        scaleTo={0.985}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700}>{title}</T>
          <T s={0.84} c="muted" lh={1.35}>{sub}</T>
        </View>
        <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
          <Icon name="chev" size={18} color={c.muted} stroke={2} />
        </View>
      </Press>
      {open ? <Rise kind="swap" style={{ paddingBottom: 12 }}>{children}</Rise> : null}
    </Card>
  );
}
