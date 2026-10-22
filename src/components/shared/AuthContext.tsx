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
import type { AccountType, Gender, Language } from "./accountRules";
import { mockData } from "./mockData";
import { loadProfile, saveProfile, type AccountProfile, type ProfilePatch } from "./profileApi";
import type { Caregiver } from "./types";

export type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  accountType: AccountType;
  dateOfBirth: string;
  gender: Gender | null;
  language: Language;
};

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  caregiver: Caregiver | null;
  familyId: string | null;
  accountError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (input: SignUpInput) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  retryAccount: () => void;
  /** The signed-in person's own profile (null in demo mode). */
  profile: AccountProfile | null;
  updateProfile: (patch: ProfilePatch) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Explicit Demo Mode: sample data only, no account, nothing is saved. */
  demo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  /** True for a brand-new real account until it is known whether a family was created. */
  isAdmin: boolean;
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
  const [accountError, setAccountError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [demo, setDemo] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const familyCreationInProgress = useRef(new Map<string, Promise<void>>());

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
      setProfile(null);
      setIsAdmin(false);
      if (!demo) {
        setCaregiver(null);
        setFamilyId(null);
      }
      setAccountError(null);
      return () => {
        active = false;
      };
    }

    setCaregiver(null);
    setFamilyId(null);
    setAccountError(null);

    const loadAccount = async () => {
      try {
        const loaded = await loadProfile(session.user);
        if (!loaded.profile) {
          if (active) setAccountError(loaded.error ?? "We couldn't load your profile. Please try again.");
          return;
        }
        const profile = loaded.profile;
        if (active) setProfile(profile);
        const loadMembership = async () => {
          const { data, error } = await supabase
            .from("family_members")
            .select("family_id, role")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data as FamilyMembership | null;
        };

        let membership = await loadMembership();
        if (!membership) {
          let creation = familyCreationInProgress.current.get(userId);
          if (!creation) {
            const familyName = `${profile.fullName || session.user.email || ""}'s family`;
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
          const email = profile.email || session.user.email || "";
          setCaregiver({
            id: userId,
            name: profile.fullName || email,
            role: profile.accountType === "helper" ? "Helper" : "Parent",
            email,
            phone: profile.phone,
            isAdmin: membership.role === "admin",
          });
          setIsAdmin(membership.role === "admin");
          setFamilyId(membership.family_id);
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
    async (input: SignUpInput): Promise<{ error?: string; needsConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            phone: input.phone,
            account_type: input.accountType,
            date_of_birth: input.dateOfBirth,
            gender: input.gender,
            language: input.language,
          },
        },
      });
      if (error) return { error: authErrorMessage(error.message) };
      // Supabase hides "already registered" for confirmed emails and returns a user with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: "An account with this email already exists." };
      }
      return data.session ? {} : { needsConfirmation: true };
    },
    [],
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!session) return { ok: false as const, error: "Your session ended. Please log in again." };
      const res = await saveProfile(session.user.id, patch);
      if (res.ok) {
        const reloaded = await loadProfile(session.user);
        if (reloaded.profile) {
          setProfile(reloaded.profile);
          setCaregiver((c) => (c ? { ...c, name: reloaded.profile!.fullName || c.name, phone: reloaded.profile!.phone } : c));
        }
      }
      return res;
    },
    [session],
  );

  const enterDemo = useCallback(() => {
    setDemo(true);
    setProfile(null);
    setFamilyId(null);
    setIsAdmin(true);
    setCaregiver({ ...mockData.caregivers[0] });
  }, []);

  const exitDemo = useCallback(() => {
    setDemo(false);
    setCaregiver(null);
    setFamilyId(null);
    setIsAdmin(false);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setSession(null);
      setCaregiver(null);
      setFamilyId(null);
      setProfile(null);
      setDemo(false);
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
        accountError,
        signIn,
        signUp,
        signOut,
        retryAccount,
        profile,
        updateProfile,
        demo,
        enterDemo,
        exitDemo,
        isAdmin,
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
