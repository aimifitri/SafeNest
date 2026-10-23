import { validateHelperDraft, type HelperDraft } from "../shared/accountRules";
export const MEMBER_TABS = [
  { value: "members", label: "Circle Members", a11y: "Circle Members" },
  { value: "pending", label: "Waiting for Approval", a11y: "Waiting for Approval" },
] as const;
export type MemberTab = typeof MEMBER_TABS[number]["value"];
export type AddMemberStep = "choose" | "manual" | "invite" | "family";
export function inviteEntry(demo: boolean) { return demo ? "demo" : "secure"; }
const nonFamilyRelationship = (relationship: string) => /\b(friend|neighbour|neighbor|babysitter|nanny|carer|caregiver)\b/i.test(relationship);
export function isFamilyRelationship(relationship: string): boolean {
  if (nonFamilyRelationship(relationship)) return false;
  return /\b(mother|father|mum|mom|dad|parent|grandmother|grandfather|grandparent|grandma|grandpa|aunt|auntie|uncle|sibling|brother|sister|cousin|relative|guardian|spouse|husband|wife|ibu|bapa|nenek|datuk|makcik|pakcik|adik|abang|kakak)\b/i.test(relationship)
    || /^(family|family member|other relative)$/i.test(relationship.trim());
}
export type MemberIdentity = { id: string; userId: string | null; kind: "family" | "helper"; role: string };
// Prefer the household's own authorization record for a linked household member.
// Never merge permissions or deduplicate different people by name.
export function groupMembers<T extends MemberIdentity>(members: readonly T[]) {
  const seen = new Set<string>();
  const family: T[] = [], helpers: T[] = [];
  for (const member of [...members.filter(m => m.kind === "family"), ...members.filter(m => m.kind === "helper")]) {
    const keys = [member.id, member.userId].filter((id): id is string => !!id);
    if (keys.some(id => seen.has(id))) continue;
    keys.forEach(id => seen.add(id));
    ((member.kind === "family" && !nonFamilyRelationship(member.role)) || isFamilyRelationship(member.role) ? family : helpers).push(member);
  }
  return { family, helpers };
}
export type MembershipVisibility = MemberIdentity & { membershipState?: string; state?: string; joined?: boolean };
// Membership completion is independent of pickup authorization (approved/canCollect).
// Household rows already represent accepted membership; callers mark those active explicitly.
export function partitionMembers<T extends MembershipVisibility>(members: readonly T[]) {
  const grouped = groupMembers(members);
  const canonical = [...grouped.family, ...grouped.helpers];
  const visible: T[] = [], pending: T[] = [];
  for (const person of canonical) {
    const state = person.membershipState ?? person.state;
    const accepted = person.kind === "family" || person.joined === true;
    if ((state === "active" || state === "approved") && accepted) visible.push(person);
    else if (state === "pending" || state === "awaitingApproval" || ((state === "active" || state === "approved") && !accepted)) pending.push(person);
  }
  return { members: visible, pending };
}
export function manualDemoMember(draft: HelperDraft, id: string) {
  if (Object.keys(validateHelperDraft(draft)).length) throw new Error("Complete the required member details.");
  return { id, userId: null, kind: "helper" as const, name: draft.name.trim(), role: draft.relationship.trim(), phone: draft.phone.trim(), approved: false, joined: true, state: "pending" as const };
}
