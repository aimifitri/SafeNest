import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../shared/AuthContext";

export type JoinedCircle = {
  membership_id: string;
  family_id: string;
  family_name: string;
  relationship: string;
  state: string;
  created_at: string;
};

type QueryState = {
  userId: string | undefined;
  memberships: JoinedCircle[];
  loading: boolean;
  error: string | null;
};

function isJoinedCircle(value: unknown): value is JoinedCircle {
  if (typeof value !== "object" || value === null) return false;
  return ["membership_id", "family_id", "family_name", "relationship", "state", "created_at"]
    .every((key) => key in value && typeof Reflect.get(value, key) === "string");
}

// Log diagnostic text only, never the error object, session or RPC payload.
function diagnosticText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value
    .replace(/Failing row contains[\s\S]*/gi, "[row data redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g, "[token redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key redacted]")
    .replace(/(?:access_token|refresh_token|apikey|authorization|password)\s*[=:]\s*[^\s,;]+/gi, "[credential redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[URL redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, "[ID redacted]")
    .slice(0, 1000);
}

export function useJoinedCircles() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState<QueryState>({
    userId: undefined, memberships: [], loading: false, error: null,
  });

  useEffect(() => {
    let active = true;
    setQuery({ userId, memberships: [], loading: !!userId, error: null });
    if (!userId) return;

    const load = async () => {
      try {
        // No caller ID argument: Supabase supplies the session JWT, and the RPC
        // derives its own identity. Keep the returned server ordering intact.
        const { data, error } = await supabase.rpc("list_my_joined_circles");
        if (error) throw error;
        const rows: unknown = data;
        if (!Array.isArray(rows) || !rows.every(isJoinedCircle)) {
          throw new Error("Unexpected Joined Circles response");
        }
        if (active) setQuery({ userId, memberships: rows, loading: false, error: null });
      } catch (error: unknown) {
        if (__DEV__ && active) {
          const field = (name: string): unknown =>
            typeof error === "object" && error !== null ? Reflect.get(error, name) : undefined;
          console.warn("[SafeNest Joined Circles] RPC load failed", {
            code: diagnosticText(field("code")),
            message: diagnosticText(field("message")),
            details: diagnosticText(field("details")),
          });
        }
        if (active) setQuery({
          userId, memberships: [], loading: false,
          error: "We couldn't load your joined circles. Please try again.",
        });
      }
    };
    void load();
    // Discard requests superseded by retry, account changes or unmounting.
    return () => { active = false; };
  }, [userId, revision]);

  const refresh = useCallback(() => {
    if (!userId) return;
    setQuery({ userId, memberships: [], loading: true, error: null });
    setRevision((current) => current + 1);
  }, [userId]);

  // Hide a previous account's results immediately, before effect cleanup runs.
  const current = query.userId === userId && !!userId;
  return {
    memberships: current ? query.memberships : [],
    loading: !!userId && (!current || query.loading),
    error: current ? query.error : null,
    signedIn: !!userId,
    refresh,
  };
}
