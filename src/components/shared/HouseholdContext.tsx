import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { useAuth } from "./AuthContext";
import type { ChildDraft, HelperDraft } from "./accountRules";
import {
  addChild as apiAddChild,
  addHelper as apiAddHelper,
  createFamilyInvite,
  createHelperInvite,
  deleteChild as apiDeleteChild,
  fetchChildren,
  fetchFamilyName,
  renameFamily as apiRenameFamily,
  fetchFamilyInvites,
  fetchHelpers,
  fetchRoster,
  removeFamilyMember,
  setMemberCanCollect as apiSetMemberCanCollect,
  removeHelper as apiRemoveHelper,
  revokeFamilyInvite,
  setHelperState as apiSetHelperState,
  updateChild as apiUpdateChild,
  type HChild,
  type HHelper,
  type HMember,
  type Missing,
  type PendingFamilyInvite,
} from "./householdApi";
import { demoChildren, demoChildFromDraft, resolveChild, childScope, SECOND_DEMO_CHILD_ID } from "./childScope";
import { validateChildDraft } from "./accountRules";
import { sim } from "./demoSim";
import { pickupDecision } from "./pickupDecision";
import { selectTeacherScope } from "./teacherCheck";
import { mockData } from "./mockData";
import type { ApiResult } from "./backupApi";
import type { ContactState, School } from "./types";

// The one place the app asks "who is in this household?".
// - Demo Mode: the sample family from mockData. Nothing is saved anywhere.
// - A real account: only what is stored in Supabase for this family. A brand-new account has none of it.
// Screens must not import mockData directly; they use useHousehold() so real accounts can never show sample people.

export type Household = {
  demo: boolean;
  /** true once the first load finished (or in demo mode). */
  ready: boolean;
  loading: boolean;
  error: string | null;
  familyId: string | null;
  familyName: string;
  children: HChild[];
  pickupScope: string;
  selectChild: (id: string) => void;
  /** The child SafeNest is currently about. null for a new account that has not added one. */
  child: HChild | null;
  school: School | null;
  helpers: HHelper[];
  members: HMember[];
  /** false when other members' names cannot be read yet (needs the account_household.sql upgrade). */
  namesAvailable: boolean;
  familyInvites: PendingFamilyInvite[];
  /** Bumps after a change so other contexts can reload (for example the stored child's school location). */
  version: number;
  refresh: () => Promise<void>;
  addChild: (d: ChildDraft) => Promise<ApiResult<string>>;
  updateChild: (id: string, d: ChildDraft) => Promise<ApiResult<null>>;
  deleteChild: (id: string) => Promise<ApiResult<null>>;
  addHelper: (d: HelperDraft) => Promise<ApiResult<string>>;
  setHelperState: (id: string, state: ContactState) => Promise<ApiResult<null>>;
  removeHelper: (id: string) => Promise<ApiResult<null>>;
  /** One-time code a helper types in after signing up. Sharing it is up to the parent. SafeNest sends nothing. */
  helperInviteCode: (helperId: string) => Promise<ApiResult<string>>;
  familyInviteCode: (d: { relationship: string; canCollect: boolean }) => Promise<Missing<string>>;
  revokeInvite: (id: string) => Promise<Missing<null>>;
  removeMember: (userId: string) => Promise<ApiResult<null>>;
  setMemberCanCollect: (userId: string, canCollect: boolean) => Promise<ApiResult<null>>;
  renameFamily: (name: string) => Promise<ApiResult<null>>;
};

const HouseholdContext = createContext<Household | null>(null);

const demoChild = (): HChild => ({
  id: mockData.child.id,
  name: mockData.child.name,
  age: mockData.child.age,
  className: mockData.child.className,
  schoolName: mockData.school.name,
  schoolAddress: mockData.school.address,
  teacherName: mockData.school.teacher,
  teacherPhone: mockData.school.teacherPhone,
});

const demoHelpers = (): HHelper[] =>
  mockData.trustedHelpers.map((h) => ({ id: h.id, name: h.name, role: h.role, phone: "", state: h.state, userId: null }));

const demoMembers = (): HMember[] =>
  mockData.familyMembers.map((m) => {
    const cg = mockData.caregivers.find((c) => c.id === m.id);
    return {
      userId: m.id, name: m.name, email: cg?.email ?? "", phone: cg?.phone ?? (m.id === "aiman" ? "+60 11-3344 5566" : ""),
      isAdmin: !!cg?.isAdmin, accountType: "parent" as const, relationship: m.role, canCollect: true,
    };
  });

const demoRefuse = <T,>(): Promise<ApiResult<T>> => Promise.resolve({ ok: false, error: "Demo Mode does not save anything. Create an account to use this." });

let householdSession = 0;

export function HouseholdProvider({ children }: PropsWithChildren) {
  const { demo, familyId, session } = useAuth();
  return <HouseholdDataProvider key={JSON.stringify([demo, session?.user.id, familyId])}>{children}</HouseholdDataProvider>;
}
function HouseholdDataProvider({ children: kids }: PropsWithChildren) {
  const { demo, familyId, session, profile, caregiver } = useAuth();
  const userId = session?.user.id ?? null;

  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [demoKids, setDemoKids] = useState<HChild[]>(demoChildren);
  const childCreation = useRef(false);
  // A new account/household/Demo Mode session cannot restore a previous session's transient pickup state.
  const [sessionScope] = useState(() => String(++householdSession));
  const [kidsList, setKidsList] = useState<HChild[]>([]);
  const [helpers, setHelpers] = useState<HHelper[]>([]);
  const [members, setMembers] = useState<HMember[]>([]);
  const [namesAvailable, setNamesAvailable] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [familyInvites, setFamilyInvites] = useState<PendingFamilyInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Demo helpers can be approved and removed on screen, but only in memory.
  const [demoHelperState, setDemoHelperState] = useState<HHelper[]>(demoHelpers);
  const seq = useRef(0);

  const selfName = profile?.fullName || caregiver?.name || "You";

  const load = useCallback(async () => {
    if (demo || !familyId || !userId) return;
    const mine = ++seq.current;
    setLoading(true);
    const [c, h, r, inv, fname] = await Promise.all([
      fetchChildren(familyId),
      fetchHelpers(familyId),
      fetchRoster(familyId, userId, selfName),
      fetchFamilyInvites(familyId),
      fetchFamilyName(familyId),
    ]);
    if (mine !== seq.current) return;
    if (!c.ok || !h.ok) {
      // Keep what we had. Never replace real data with sample data, and never pretend it is empty because a call failed.
      setError(!c.ok ? c.error : !h.ok ? h.error : null);
    } else {
      setError(null);
      setKidsList(c.data);
      setHelpers(h.data);
    }
    setMembers(r.members);
    setNamesAvailable(r.namesAvailable);
    setFamilyInvites(inv);
    setFamilyName(fname);
    setLoading(false);
    setReady(true);
    setVersion((v) => v + 1);
  }, [demo, familyId, userId, selfName]);

  // Reset when the account changes. This is what stops one person's data showing for the next login.
  useEffect(() => {
    seq.current += 1;
    setKidsList([]);
    setHelpers([]);
    setMembers([]);
    setFamilyInvites([]);
    setFamilyName("");
    setError(null);
    setReady(demo);
    setDemoHelperState(demoHelpers());
    if (!demo && familyId && userId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, familyId, userId]);

  useEffect(() => {
    if (demo || !familyId) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load();
    });
    return () => sub.remove();
  }, [demo, familyId, load]);

  const after = useCallback(
    async <T,>(p: Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
      const res = await p;
      if (res.ok) await load();
      return res;
    },
    [load],
  );

  const availableChildren = demo ? demoKids : kidsList;
  const selectedChild = resolveChild(availableChildren, selectedChildId);
  const pickupScope = sessionScope + childScope(demo ? "demo" : userId ?? "signed-out", familyId, selectedChild?.id ?? null);
  useLayoutEffect(() => {
    sim.selectScope(pickupScope, demo && selectedChild?.id === SECOND_DEMO_CHILD_ID);
    pickupDecision.selectScope(pickupScope);
    selectTeacherScope(pickupScope);
  }, [pickupScope]);
  const selectChild = (id: string) => { if (availableChildren.some(child => child.id === id)) setSelectedChildId(id); };
  const value = useMemo<Household>(() => {
    if (demo) {
      const c = selectedChild ?? demoChild();
      return {
        demo: true, ready: true, loading: false, error: null, familyId: null, familyName: "Abu and Siti's family (demo)",
        children: demoKids, child: c, pickupScope, selectChild, school: { name: c.schoolName, address: c.schoolAddress, teacher: c.teacherName, teacherPhone: c.teacherPhone },
        helpers: demoHelperState, members: demoMembers(), namesAvailable: true, familyInvites: [], version: 0,
        refresh: async () => {},
        addChild: async d => {
          if (Object.keys(validateChildDraft(d)).length) return { ok: false, error: "Complete the required child details." };
          const id = `demo-child-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setDemoKids(current => [...current, demoChildFromDraft(d, id)]);
          setSelectedChildId(id);
          return { ok: true, data: id };
        },
        updateChild: () => demoRefuse<null>(),
        deleteChild: () => demoRefuse<null>(),
        addHelper: async (d) => {
          const id = `demo-helper-${Date.now()}`;
          setDemoHelperState((cur) => [...cur, { id, name: d.name.trim(), role: d.relationship.trim(), phone: d.phone.trim(), state: "pending", userId: null }]);
          return { ok: true, data: id };
        },
        setHelperState: async (id, state) => {
          setDemoHelperState((cur) => cur.map((h) => (h.id === id ? { ...h, state } : h)));
          return { ok: true, data: null };
        },
        removeHelper: async (id) => {
          setDemoHelperState((cur) => cur.filter((h) => h.id !== id));
          return { ok: true, data: null };
        },
        helperInviteCode: () => demoRefuse<string>(),
        familyInviteCode: async () => ({ ok: false, error: "Demo Mode does not create real invitations.", missing: false }),
        revokeInvite: async () => ({ ok: false, error: "Demo Mode does not create real invitations.", missing: false }),
        removeMember: () => demoRefuse<null>(),
        setMemberCanCollect: () => demoRefuse<null>(),
        renameFamily: () => demoRefuse<null>(),
      };
    }
    const first = selectedChild;
    const school: School | null = first
      ? { name: first.schoolName, address: first.schoolAddress, teacher: first.teacherName, teacherPhone: first.teacherPhone }
      : null;
    const need = <T,>(): Promise<ApiResult<T>> => Promise.resolve({ ok: false, error: "Your family account is not ready yet." });
    return {
      demo: false, ready, loading, error, familyId, familyName, pickupScope, selectChild, children: kidsList, child: first, school,
      helpers, members, namesAvailable, familyInvites, version,
      refresh: load,
      addChild: async d => {
        if (!familyId) return need<string>();
        if (childCreation.current) return { ok: false, error: "A child is already being saved. Please wait." };
        if (Object.keys(validateChildDraft(d)).length) return { ok: false, error: "Complete the required child details." };
        childCreation.current = true;
        try { const result = await after(apiAddChild(familyId, d)); if (result.ok) setSelectedChildId(result.data); return result; }
        finally { childCreation.current = false; }
      },
      updateChild: (id, d) => after(apiUpdateChild(id, d)),
      deleteChild: (id) => after(apiDeleteChild(id)),
      addHelper: (d) => (familyId ? after(apiAddHelper(familyId, d)) : need<string>()),
      setHelperState: (id, s) => after(apiSetHelperState(id, s)),
      removeHelper: (id) => after(apiRemoveHelper(id)),
      helperInviteCode: (id) => createHelperInvite(id),
      familyInviteCode: async (d) => {
        if (!familyId) return { ok: false, error: "Your family account is not ready yet.", missing: false };
        const res = await createFamilyInvite(familyId, d);
        if (res.ok) void load();
        return res;
      },
      revokeInvite: async (id) => {
        const res = await revokeFamilyInvite(id);
        if (res.ok) void load();
        return res;
      },
      removeMember: (uid) => (familyId ? after(removeFamilyMember(familyId, uid)) : need<null>()),
      setMemberCanCollect: (uid, on) => (familyId ? after(apiSetMemberCanCollect(familyId, uid, on)) : need<null>()),
      renameFamily: (name) => (familyId ? after(apiRenameFamily(familyId, name)) : need<null>()),
    };
  }, [demo, demoKids, selectedChild, pickupScope, demoHelperState, ready, loading, error, familyId, familyName, kidsList, helpers, members, namesAvailable, familyInvites, version, load, after]);

  return <HouseholdContext.Provider value={value}>{kids}</HouseholdContext.Provider>;
}

export function useHousehold(): Household {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used inside HouseholdProvider");
  return ctx;
}

/**
 * Child and school with safe wording when something is missing ("your child", "the school"), so a screen never needs
 * to import sample data to avoid a blank. `hasChild` says whether a real child profile exists.
 */
export function useChildSchool() {
  const h = useHousehold();
  const c = h.child;
  const s = h.school;
  const child = { id: c?.id ?? "", name: c?.name || "your child", age: c?.age ?? null, className: c?.className ?? "" };
  const school = {
    name: s?.name || "the school",
    address: s?.address ?? "",
    teacher: s?.teacher || "the class teacher",
    teacherPhone: s?.teacherPhone ?? "",
  };
  return { child, school, hasChild: !!c, household: h };
}
