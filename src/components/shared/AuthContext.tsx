import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";
import type { Caregiver } from "./types";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  caregiver: Caregiver | null;
  familyId: string | null;
  childId: string | null;
  accountError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  retryAccount: () => void;
};

type ProfileRecord = {
  full_name: string | null;
  role: string;
  email: string | null;
  phone: string | null;
};

type FamilyMembership = {
  family_id: string;
  role: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(message: string | undefined): string {
  const normalized = message?.toLowerCase() ?? "";
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid_credentials")
  ) {
    return "Incorrect email or password.";
  }
  if (
    normalized.includes("password") &&
    (normalized.includes("length") || normalized.includes("least"))
  ) {
    return "Password must be at least 6 characters.";
  }
  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered")
  ) {
    return "An account with this email already exists.";
  }
  if (normalized.includes("email")) {
    return "Please check your email address and try again.";
  }
  return "Unable to complete your request. Please try again.";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const familyCreationInProgress = useRef(new Map<string, Promise<void>>());
  const childCreationInProgress = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setSession(null);
        setAccountError("We couldn't restore your session. Please log in again.");
      } else {
        setSession(data.session);
      }
      setLoading(false);
    }).catch(() => {
      setSession(null);
      setAccountError("We couldn't restore your session. Please log in again.");
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const userId = session?.user.id;
    if (!userId || !session) {
      setCaregiver(null);
      setFamilyId(null);
      setChildId(null);
      setAccountError(null);
      return () => {
        active = false;
      };
    }

    setCaregiver(null);
    setFamilyId(null);
    setChildId(null);
    setAccountError(null);

    const loadAccount = async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, role, email, phone")
          .eq("id", userId)
          .single();

        if (profileError || !profileData) {
          if (active) {
            setAccountError("We couldn't load your profile. Please try again.");
          }
          return;
        }

        const profile = profileData as ProfileRecord;
        const loadMembership = async () => {
          const { data, error } = await supabase
            .from("family_members")
            .select("family_id, role")
            .eq("user_id", userId)
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data as FamilyMembership | null;
        };

        let membership = await loadMembership();
        if (!membership) {
          let creation = familyCreationInProgress.current.get(userId);
          if (!creation) {
            const familyName = `${profile.full_name || session.user.email || ""}'s family`;
            const pendingCreation: Promise<void> = (async () => {
              const { error } = await supabase.rpc("create_family", {
                family_name: familyName,
              });
              if (error) {
                throw error;
              }
            })();
            familyCreationInProgress.current.set(userId, pendingCreation);
            creation = pendingCreation;
          }

          try {
            await creation;
          } finally {
            if (familyCreationInProgress.current.get(userId) === creation) {
              familyCreationInProgress.current.delete(userId);
            }
          }
          membership = await loadMembership();
        }

        if (!membership) {
          if (active) {
            setAccountError("We couldn't find your family account. Please try again.");
          }
          return;
        }

        if (active) {
          setFamilyId(membership.family_id);
        }

        let childCreation = childCreationInProgress.current.get(membership.family_id);
        if (!childCreation) {
          const pendingCreation = (async () => {
            const { data, error } = await supabase.rpc("ensure_child", {
              fid: membership.family_id,
            });
            if (error) throw error;
            if (typeof data !== "string" || !data) {
              throw new Error("ensure_child returned no child id");
            }
            return data;
          })();
          childCreationInProgress.current.set(membership.family_id, pendingCreation);
          childCreation = pendingCreation;
        }

        let ensuredChildId: string;
        try {
          ensuredChildId = await childCreation;
        } catch {
          if (active) {
            setAccountError("We couldn't load your child. Please try again.");
          }
          return;
        } finally {
          if (childCreationInProgress.current.get(membership.family_id) === childCreation) {
            childCreationInProgress.current.delete(membership.family_id);
          }
        }

        if (active) {
          const email = profile.email ?? session.user.email ?? "";
          setCaregiver({
            id: userId,
            name: profile.full_name || email,
            role: profile.role,
            email,
            phone: profile.phone ?? "",
            isAdmin: membership.role === "admin",
          });
          setChildId(ensuredChildId);
        }
      } catch {
        if (active) {
          setAccountError("We couldn't load your family account. Please try again.");
        }
      }
    };

    void loadAccount();
    return () => {
      active = false;
    };
  }, [session?.user.id, retryVersion]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: authErrorMessage(error.message) } : {};
    },
    [],
  );

  const signUp = useCallback(
    async (
      fullName: string,
      email: string,
      password: string,
    ): Promise<{ error?: string; needsConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return { error: authErrorMessage(error.message) };
      return data.session ? {} : { needsConfirmation: true };
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setCaregiver(null);
      setFamilyId(null);
      setChildId(null);
      setAccountError(null);
    }
  }, []);

  const retryAccount = useCallback(() => {
    setRetryVersion((current) => current + 1);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        caregiver,
        familyId,
        childId,
        accountError,
        signIn,
        signUp,
        signOut,
        retryAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
