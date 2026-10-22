import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthContext";
import { coerceAvailability, deviceTimeZone, emptyAvailability, type Availability } from "./availability";
import { loadFamilyAvailability, loadOwnAvailability, saveOwnAvailability } from "./availabilityStore";

/** The signed-in person's own availability with an explicit Save. `where` says honestly who can see it. */
export function useOwnAvailability() {
  const { session, demo } = useAuth();
  const userId = session?.user.id ?? null;
  const [saved, setSaved] = useState<Availability | null>(null);
  const [draft, setDraft] = useState<Availability>(() => emptyAvailability(deviceTimeZone()));
  const [where, setWhere] = useState<"shared" | "device" | "none">("none");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let live = true;
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadOwnAvailability(userId).then((r) => {
      if (!live) return;
      setSaved(r.availability);
      setDraft(r.availability ?? emptyAvailability(deviceTimeZone()));
      setWhere(r.where);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const dirty = useMemo(() => JSON.stringify(coerceAvailability(draft)) !== JSON.stringify(saved ? coerceAvailability(saved) : null), [draft, saved]);

  const save = useCallback(async () => {
    if (!userId || saving) return false;
    setSaving(true);
    setError("");
    setJustSaved(false);
    const clean = coerceAvailability(draft, deviceTimeZone());
    const res = await saveOwnAvailability(userId, clean);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setSaved(clean);
    setDraft(clean);
    setWhere(res.where);
    setJustSaved(true);
    return true;
  }, [userId, saving, draft]);

  const edit = useCallback((fn: (a: Availability) => Availability) => {
    setJustSaved(false);
    setDraft((cur) => fn(cur));
  }, []);

  return { demo, draft, saved, edit, dirty, save, saving, loading, error, where, justSaved, hasSaved: saved !== null, hasSavedOrDraft: saved !== null };
}

/** Availability for a set of people (the Circle). Only people who saved to the shared table are known. */
export function useFamilyAvailability(userIds: string[]) {
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const key = userIds.slice().sort().join(",");
  const [map, setMap] = useState<Record<string, Availability>>({});
  const [own, setOwn] = useState<Availability | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const [others, mine] = await Promise.all([loadFamilyAvailability(userIds.filter((u) => u !== me)), me ? loadOwnAvailability(me) : Promise.resolve(null)]);
      if (!live) return;
      setMap(others);
      setOwn(mine?.availability ?? null);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me]);
  return useMemo(() => ({ ...map, ...(me && own ? { [me]: own } : {}) }), [map, own, me]);
}

/** Has this person saved any availability yet? (For the setup checklist.) */
export function useHasAvailability(refreshKey: unknown = 0): boolean {
  const { session, demo } = useAuth();
  const uid = session?.user.id ?? null;
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (demo) {
      setHas(true);
      return;
    }
    if (!uid) return;
    let live = true;
    void loadOwnAvailability(uid).then((r) => {
      if (live) setHas(r.availability !== null);
    });
    return () => {
      live = false;
    };
  }, [uid, demo, refreshKey]);
  return has;
}
