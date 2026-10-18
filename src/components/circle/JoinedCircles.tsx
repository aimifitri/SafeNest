import { useState } from "react";
import { View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { Sheet } from "../shared/Sheet";
import { StatusPill } from "../shared/StatusPill";
import { Banner, Btn, Dl, Press, T } from "../shared/ui";
import { canLeaveDemoCircle, isDemoPickupEligible, membershipLabels } from "./circleDemo";
import type { DemoMembership } from "./circleDemo";

export function JoinedCircles({ memberships, onLeave }: {
  memberships: DemoMembership[];
  onLeave: (membershipId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = memberships.find((item) => item.id === selectedId);
  const close = () => { setSelectedId(null); setConfirmLeave(false); };
  return (
    <>
      <Banner>Fictional memberships for the selected demo user. No child details or locations are shared here.</Banner>
      {notice ? <Banner>{notice}</Banner> : null}
      {memberships.length === 0 ? <Card style={{ gap: 8 }}>
        <T w={800}>No joined circles yet</T>
        <T c="muted">This demo user has no sample memberships. In a future connected version, accepted invitations awaiting approval and approved families would appear here.</T>
      </Card> : memberships.map((membership) => (
        <Card key={membership.id} tight>
          <Press label={`Inspect ${membership.familyName}, ${membershipLabels[membership.status]}`} onPress={() => { setSelectedId(membership.id); setConfirmLeave(false); }} style={{ gap: 10, paddingVertical: 12, minHeight: 64 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={membership.familyName} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}><T w={700}>{membership.familyName}</T><T s={0.85} c="muted">{membership.role}</T></View>
            </View>
            <StatusPill label={membershipLabels[membership.status]} tone={membership.status === "approved" ? "success" : membership.status === "revoked" ? "danger" : "warning"} />
            <T s={0.85} c="muted">View membership details</T>
          </Press>
        </Card>
      ))}
      <Sheet visible={!!selected} onClose={close} title={confirmLeave ? "Leave demo circle?" : "Demo membership"} closeLabel="Close membership details">
        {selected ? <>
          <T s={1.1} w={800}>{selected.familyName}</T>
          <Dl first k="Demo user" v={selected.userName} />
          <Dl k="Membership role" v={selected.role} />
          <Dl k="Status" v={membershipLabels[selected.status]} />
          <Dl k="Invitation" v={selected.invitationStatus === "preview" ? "Not yet accepted" : selected.invitationStatus === "accepted" ? "Accepted; awaiting approval" : selected.invitationStatus === "approved" ? "Approved (demo)" : "Revoked (demo)"} />
          <T c="muted">{isDemoPickupEligible(selected) ? "Approved in the demo. Future pickup eligibility would require server checks. No real requests can be received here." : "This membership is not eligible for pickup requests."}</T>
          {confirmLeave ? <>
            <T>Confirm leaving {selected.familyName}? This marks your local demo membership as Revoked. Nothing is sent to the family.</T>
            <Btn kind="o" onPress={() => setConfirmLeave(false)}>Cancel</Btn>
            <Btn kind="t" disabled={!canLeaveDemoCircle(selected)} onPress={() => {
              if (!canLeaveDemoCircle(selected)) return;
              onLeave(selected.id);
              setNotice(`You left ${selected.familyName} in this demo. Membership is now Revoked.`);
              close();
            }}>Confirm leave demo circle</Btn>
          </> : canLeaveDemoCircle(selected) ? <Btn kind="t" onPress={() => setConfirmLeave(true)}>Leave Circle (demo)</Btn> : <T c="muted">This membership has already been revoked. No leave action is available.</T>}
        </> : null}
      </Sheet>
    </>
  );
}
