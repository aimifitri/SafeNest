import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { shouldAutoOpenOnboarding } from "../shared/setupTasks";

// Whether first-time setup is showing, and how far through it this person got. Progress is kept per account on this
// phone. What the person entered along the way is saved to their account as they go, not here.

type Stored = { status: "done" | "skipped"; step?: number } | { status?: undefined; step: number };
type Value = { open: boolean; step: number; setStep: (n: number) => void; show: () => void; finish: (status: "done" | "skipped") => void };

const Ctx = createContext<Value | null>(null);
const key = (uid: string) => `safenest:onboarding:${uid}`;

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { session, profile, demo } = useAuth();
  const h = useHousehold();
  const uid = session?.user.id ?? null;
  const [stored, setStored] = useState<"loading" | "none" | "done" | "skipped">("loading");
  const [step, setStepState] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    setStepState(0);
    if (!uid) {
      setStored("none");
      return;
    }
    setStored("loading");
    void AsyncStorage.getItem(key(uid))
      .then((raw) => {
        const v = raw ? (JSON.parse(raw) as Stored) : null;
        setStored(v?.status ?? "none");
        if (v?.step) setStepState(v.step);
      })
      .catch(() => setStored("none"));
  }, [uid]);

  useEffect(() => {
    if (stored === "loading") return;
    if (shouldAutoOpenOnboarding({ real: !demo && !!uid, ready: h.ready && !!profile, stored, hasChild: !!h.child, helperCount: h.helpers.length, accountType: profile?.accountType ?? null })) {
      setOpen(true);
    }
  }, [stored, demo, uid, h.ready, h.child, h.helpers.length, profile]);

  const persist = useCallback((v: Stored) => {
    if (uid) void AsyncStorage.setItem(key(uid), JSON.stringify(v)).catch(() => {});
  }, [uid]);

  const setStep = useCallback((n: number) => {
    setStepState(n);
    persist({ step: n });
  }, [persist]);

  const finish = useCallback((status: "done" | "skipped") => {
    setOpen(false);
    setStored(status);
    persist({ status, step });
  }, [persist, step]);

  const show = useCallback(() => {
    setStepState(0);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ open, step, setStep, show, finish }), [open, step, setStep, show, finish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return v;
}
