// Screen-owned fictional data only. No tokens, persistence, auth or pickup integration.
// State survives the two Circle tabs, but resets when TrustedCircle unmounts.
export type MembershipStatus = "pending" | "awaitingApproval" | "approved" | "revoked";
export type InvitationStatus = "preview" | "accepted" | "approved" | "revoked";
export type DemoActor = { id: string; isAdmin: boolean };
export type DemoMembership = {
  id: string;
  familyId: string;
  familyName: string;
  userId: string;
  userName: string;
  role: "Trusted helper";
  status: MembershipStatus;
  invitationStatus: InvitationStatus;
};
export type DemoInvitation = {
  familyId: string;
  targetUserId: string;
  targetUserName: string;
  status: InvitationStatus;
};
export type CircleDemoState = {
  invitation: DemoInvitation | null;
  memberships: DemoMembership[];
};
export const DEMO_FAMILY = {
  id: "demo-safenest-family",
  name: "SafeNest Sample Family",
  adminUserIds: ["abu", "siti"],
};
export const membershipLabels: Record<MembershipStatus, string> = {
  pending: "Pending",
  awaitingApproval: "Awaiting Approval",
  approved: "Approved",
  revoked: "Revoked",
};
export function canManageDemoInvitations(actor: DemoActor | null): boolean {
  return !!actor?.isAdmin && DEMO_FAMILY.adminUserIds.includes(actor.id);
}
export function canLeaveDemoCircle(membership: DemoMembership): boolean {
  return membership.status !== "revoked";
}
export function isDemoPickupEligible(membership: DemoMembership): boolean {
  return membership.status === "approved";
}
export function createCircleDemoState(): CircleDemoState {
  const statuses: MembershipStatus[] = ["approved", "pending", "awaitingApproval", "revoked"];
  const names = ["Fern", "Orchid", "Cedar", "Willow"];
  return {
    invitation: null,
    // Abu has four examples; Siti and newly added accounts have an empty state.
    memberships: statuses.map((status, index) => ({
      id: `demo-membership-${index}`,
      familyId: `demo-family-${index}`,
      familyName: `${names[index]} Family (demo)`,
      userId: "abu",
      userName: "Abu",
      role: "Trusted helper",
      status,
      invitationStatus: status === "awaitingApproval" ? "accepted" : status === "pending" ? "preview" : status,
    })),
  };
}
export type CircleDemoAction =
  | { type: "generate"; actor: DemoActor }
  | { type: "accept"; actor: DemoActor }
  | { type: "approve"; actor: DemoActor }
  | { type: "leave"; userId: string; membershipId: string };

export function circleDemoReducer(state: CircleDemoState, action: CircleDemoAction): CircleDemoState {
  if (action.type === "leave") {
    const leaving = state.memberships.find((membership) =>
      membership.id === action.membershipId && membership.userId === action.userId && canLeaveDemoCircle(membership));
    if (!leaving) return state;
    return {
      ...state,
      invitation: leaving.id === "demo-invitation-membership" && state.invitation
        ? { ...state.invitation, status: "revoked" }
        : state.invitation,
      memberships: state.memberships.map((membership) =>
        membership.id === action.membershipId && membership.userId === action.userId && canLeaveDemoCircle(membership)
          ? { ...membership, status: "revoked", invitationStatus: "revoked" }
          : membership),
    };
  }
  // A demo UI guard only. Real authorization belongs to the future backend.
  if (!canManageDemoInvitations(action.actor)) return state;
  if (action.type === "generate") {
    if (state.invitation) return state;
    const otherUser = action.actor.id === "abu" ? { id: "siti", name: "Siti" } : { id: "abu", name: "Abu" };
    return {
      ...state,
      invitation: { familyId: DEMO_FAMILY.id, targetUserId: otherUser.id, targetUserName: otherUser.name, status: "preview" },
      memberships: [...state.memberships, {
        id: "demo-invitation-membership",
        familyId: DEMO_FAMILY.id,
        familyName: DEMO_FAMILY.name,
        userId: otherUser.id,
        userName: otherUser.name,
        role: "Trusted helper",
        status: "pending",
        invitationStatus: "preview",
      }],
    };
  }
  const invitation = state.invitation;
  if (!invitation) return state;
  if (action.type === "accept" && invitation.status !== "preview") return state;
  if (action.type === "approve" && invitation.status !== "accepted") return state;
  const invitationStatus = action.type === "accept" ? "accepted" : "approved";
  return {
    invitation: { ...invitation, status: invitationStatus },
    memberships: state.memberships.map((membership) => membership.id === "demo-invitation-membership"
      ? { ...membership, status: action.type === "accept" ? "awaitingApproval" : "approved", invitationStatus }
      : membership),
  };
}

// An intentionally non-routable preview, never a real invitation URL/token.
export const DEMO_INVITATION_CONTENT =
  "SafeNest NONFUNCTIONAL DEMO invitation\nPreview only: [DEMO LINK - DOES NOT OPEN OR JOIN A CIRCLE]\nFictional family: SafeNest Sample Family\nNo valid URL or invitation token. Nothing is delivered by this demo. Acceptance and administrator approval are simulated locally.";
