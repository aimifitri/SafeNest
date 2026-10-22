import { useState } from "react";
import { Platform, Share, Text, View } from "react-native";

import { Card } from "../shared/Card";
import { Sheet } from "../shared/Sheet";
import { StatusPill } from "../shared/StatusPill";
import { useAppContext } from "../shared/AppContext";
import { fontFace } from "../shared/theme";
import { Banner, Btn, Err, T, OS_FONT_CAP } from "../shared/ui";
import { canManageDemoInvitations, DEMO_INVITATION_CONTENT, membershipLabels } from "./circleDemo";
import type { CircleDemoState, DemoActor } from "./circleDemo";

type BrowserCapabilities = {
  navigator?: {
    clipboard?: { writeText: (text: string) => Promise<void> };
    share?: (data: { title: string; text: string }) => Promise<void>;
  };
};

export function InvitationSheet({ visible, onClose, actor, state, onGenerate, onAccept, onApprove }: {
  visible: boolean;
  onClose: () => void;
  actor: DemoActor | null;
  state: CircleDemoState;
  onGenerate: () => void;
  onAccept: () => void;
  onApprove: () => void;
}) {
  const { theme } = useAppContext();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canManageDemoInvitations(actor)) return null;
  const browser = Platform.OS === "web" ? (globalThis as unknown as BrowserCapabilities).navigator : undefined;
  const canCopy = typeof browser?.clipboard?.writeText === "function";
  const canShare = Platform.OS === "ios" || Platform.OS === "android" || typeof browser?.share === "function";
  const membership = state.memberships.find((item) => item.id === "demo-invitation-membership");
  const perform = async (kind: "copy" | "share") => {
    if (busy || !state.invitation) return;
    setBusy(true);
    setFeedback("");
    setError("");
    try {
      if (kind === "copy") {
        if (!canCopy || !browser?.clipboard) throw new Error("Copy is unavailable. Select the demo text to copy it manually.");
        await browser.clipboard.writeText(DEMO_INVITATION_CONTENT);
        setFeedback("Nonfunctional demo text copied. This is not a valid invitation.");
      } else if (Platform.OS === "web") {
        if (!browser?.share) throw new Error("Sharing is unavailable in this browser.");
        await browser.share({ title: "SafeNest nonfunctional demo", text: DEMO_INVITATION_CONTENT });
        setFeedback("Demo share interface closed. Delivery is not verified.");
      } else {
        const result = await Share.share({ title: "SafeNest nonfunctional demo", message: DEMO_INVITATION_CONTENT });
        setFeedback(result.action === Share.dismissedAction ? "Demo sharing cancelled." : "Demo share interface closed. Delivery is not verified.");
      }
    } catch (failure) {
      if (failure instanceof Error && failure.name === "AbortError") setFeedback("Demo sharing cancelled.");
      else setError("Unable to copy or share the demo preview. Select the text manually or try again on a supported device.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Demo invitation" closeLabel="Close demo invitation">
      <Banner>Simulation as Abu, a fictional family administrator. Your signed-in account's permissions are unchanged. No valid link, token or invitation is created.</Banner>
      <T lh={1.45}>An administrator creates an invitation. A helper accepts, then waits for administrator approval. Only approved helpers may eventually receive pickup requests.</T>
      {!state.invitation ? <Btn kind="p" icon="plus" onPress={onGenerate}>Generate demo invitation preview</Btn> : (
        <>
          <Card>
            <T w={700}>Nonfunctional invitation-link preview</T>
            <Text selectable maxFontSizeMultiplier={OS_FONT_CAP} style={{ color: theme.colors.ink, fontSize: 14 * theme.textScale, lineHeight: 21 * theme.textScale, ...fontFace(theme.font, 400), marginTop: 8 }}>{DEMO_INVITATION_CONTENT}</Text>
          </Card>
          <View style={{ gap: 10 }}>
            <Btn kind="s" icon="copy" disabled={!canCopy || busy} onPress={() => void perform("copy")}>Copy demo text</Btn>
            {!canCopy ? <T s={0.85} c="muted">{Platform.OS === "web" ? "Clipboard copying is unavailable in this browser context. Select the text manually." : "Native copying is unavailable in this demo build. Select the text manually or use Share. No clipboard package has been added."}</T> : null}
            <Btn kind="s" icon="chat" disabled={!canShare || busy} onPress={() => void perform("share")}>Share nonfunctional demo</Btn>
            {!canShare ? <T s={0.85} c="muted">The share interface is unavailable on this platform.</T> : null}
          </View>
          {membership ? <Card style={{ gap: 10 }}>
            <T w={700}>Workflow preview for {membership.userName} (demo user)</T>
            <T s={0.9}>{membership.familyName} · {membership.role}</T>
            <StatusPill label={membershipLabels[membership.status]} tone={membership.status === "approved" ? "success" : "warning"} />
            <T s={0.9} c="muted">{membership.status === "pending" ? "Invitation preview created. Acceptance has not been simulated." : membership.status === "awaitingApproval" ? "Acceptance simulated. Awaiting the fictional family administrator's approval." : membership.status === "revoked" ? "This fictional membership was revoked or left. No pickup permission is enabled." : "Approval simulated. Switch the demo persona to Siti, then open Joined Circles to inspect it."}</T>
            {state.invitation.status === "preview" ? <Btn kind="dash" onPress={onAccept}>Simulate {membership.userName} accepting</Btn> : null}
            {state.invitation.status === "accepted" ? <Btn kind="p" onPress={onApprove}>Simulate administrator approval</Btn> : null}
            {membership.status === "approved" ? <Banner>Helper's Joined Circles preview: {membership.familyName} — Approved. This is the same local membership record used by Joined Circles.</Banner> : null}
            <T s={0.82} c="muted">This preview acts out another user's response on this device. No real cross-account invitation works, and no pickup request is enabled by it.</T>
          </Card> : null}
        </>
      )}
      {busy ? <T c="muted">Waiting for the platform copy or share action...</T> : null}
      {feedback ? <Banner>{feedback}</Banner> : null}
      <Err text={error} />
      <T s={0.82} c="muted">Invitation and membership changes survive fictional persona changes but reset on authenticated account change or screen remount. Sharing this preview cannot join a family.</T>
    </Sheet>
  );
}
