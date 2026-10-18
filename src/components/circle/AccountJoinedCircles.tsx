import { ActivityIndicator, View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { StatusPill } from "../shared/StatusPill";
import { Banner, Btn, T, useColors } from "../shared/ui";
import { useJoinedCircles } from "./useJoinedCircles";

function membershipState(state: string): {
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
} {
  switch (state) {
    case "pending": return { label: "Pending", tone: "warning" };
    case "active": return { label: "Active", tone: "info" };
    case "rejected": return { label: "Rejected", tone: "danger" };
    default: return { label: "Unknown status", tone: "neutral" };
  }
}

export function AccountJoinedCircles() {
  const { memberships, loading, error, signedIn, refresh } = useJoinedCircles();
  const colors = useColors();

  return (
    <>
      <Banner>These joined circles belong to your signed-in account. Membership status alone does not grant pickup permission. Invitations, approvals and leaving are not connected here yet.</Banner>
      {!signedIn ? <Card><T>Sign in to view your joined circles.</T></Card> : <>
        <Btn kind="o" onPress={refresh} disabled={loading} label={error ? "Retry loading joined circles" : "Refresh joined circles"}>
          {error ? "Try again" : "Refresh"}
        </Btn>
        {loading ? (
          <View accessibilityLiveRegion="polite" style={{ paddingVertical: 16, gap: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <T c="muted">Loading your joined circles…</T>
          </View>
        ) : error ? (
          <View accessibilityRole="alert"><Card><T>{error}</T></Card></View>
        ) : memberships.length === 0 ? (
          <Card style={{ gap: 8 }}>
            <T w={800}>No joined circles yet</T>
            <T c="muted">Your account has no linked trusted-helper memberships.</T>
          </Card>
        ) : memberships.map((membership) => {
          const status = membershipState(membership.state);
          return (
            <Card key={membership.membership_id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={membership.family_name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={700}>{membership.family_name}</T>
                  <T s={0.85} c="muted">{membership.relationship.trim() || "Relationship not specified"}</T>
                </View>
              </View>
              <StatusPill label={status.label} tone={status.tone} />
            </Card>
          );
        })}
      </>}
    </>
  );
}
