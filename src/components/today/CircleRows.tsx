import { View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { STATUS_LABEL } from "../shared/pickupFlow";
import type { FlowRecipient, RecipientStatus } from "../shared/pickupFlow";
import { Chip, Rise, T, useColors } from "../shared/ui";
import type { ChipKind } from "../shared/ui";

const KIND: Record<RecipientStatus, ChipKind> = { pending: "wait", accepted: "ok", declined: "no", no_response: "plain", closed: "plain" };

/** Everyone who was asked, each with their own answer. Nearby people are marked but never ranked above others. */
export function CircleRows({ rows }: { rows: FlowRecipient[] }) {
  const c = useColors();
  if (rows.length === 0) return null;
  return (
    <View accessibilityRole="list" style={{ marginTop: 4 }}>
      {rows.map((r, i) => (
        <View
          key={r.id}
          accessible
          accessibilityLabel={`${r.name}, ${r.kind === "family" ? "family" : "Trusted Circle"}, ${STATUS_LABEL[r.status]}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}
        >
          <Avatar name={r.name} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={0.95} w={700} lh={1.25}>{r.name}</T>
            <T s={0.8} c="muted" lh={1.3}>
              {[r.role, r.kind === "family" ? "Family" : "Trusted Circle", r.nearby ? "Nearby" : null].filter(Boolean).join(" · ")}
            </T>
          </View>
          <Rise key={r.status} kind="swap">
            <Chip kind={KIND[r.status]} icon={r.status === "accepted" ? "check" : undefined}>{STATUS_LABEL[r.status]}</Chip>
          </Rise>
        </View>
      ))}
    </View>
  );
}
