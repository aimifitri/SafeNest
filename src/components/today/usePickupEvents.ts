import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { acknowledged, deriveMilestones, eventStoreKey, latestPending, parseAcked, serializeAcked } from "../shared/pickupEvents";
import type { EventSource, Milestone } from "../shared/pickupEvents";

// Demo acknowledgements live in memory only and are keyed by the demo episode, so a demo reset starts clean.
const demoAcks = new Map<string, Set<string>>();

type Input = {
  /** Real: the persisted store key. Demo: an in-memory episode key. */
  storeKey: string;
  persist: boolean;
  source: EventSource;
  /** The first complete answer from the data sources has arrived (not a loading state). */
  ready: boolean;
};

/**
 * Turns pickup state into "a new meaningful event needs showing". It never opens anything itself.
 * - No record yet for this account and child: the first complete snapshot is the baseline, not news.
 * - A record exists: anything that happened since (even while the app was closed) is announced once.
 * - acknowledge() marks everything currently known as seen, in memory first, then in storage.
 */
export function usePickupEvents({ storeKey, persist, source, ready }: Input) {
  const acked = useRef<Set<string>>(new Set());
  const baseline = useRef(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!persist) {
      acked.current = demoAcks.get(storeKey) ?? new Set();
      demoAcks.set(storeKey, acked.current);
      baseline.current = false;
      setLoadedKey(storeKey);
      return;
    }
    setLoadedKey(null);
    void AsyncStorage.getItem(storeKey).then((raw) => {
      if (!active) return;
      const parsed = parseAcked(raw);
      baseline.current = parsed === null;
      acked.current = parsed ?? new Set();
      setLoadedKey(storeKey);
    }).catch(() => {
      // Unreadable storage: stay quiet rather than risk repeating old events.
      if (!active) return;
      baseline.current = false; acked.current = new Set(); setLoadedKey(`${storeKey}#unreadable`);
    });
    return () => { active = false; };
  }, [storeKey, persist]);

  const milestones = useMemo(() => deriveMilestones(source),
    // The source object is rebuilt every render; its keys only change when a real fact changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify([source.roundId, source.reason, source.recipients, source.journey, source.cancelledToday, source.collectorName, source.teacher, new Date(source.now).toDateString()])]);
  const latest = useRef(milestones);
  latest.current = milestones;

  const save = useCallback(async (): Promise<boolean> => {
    if (!persist) return true;
    try { await AsyncStorage.setItem(storeKey, serializeAcked(acked.current)); return true; } catch { return false; }
  }, [persist, storeKey]);

  const acknowledge = useCallback(async (): Promise<boolean> => {
    acked.current = acknowledged(acked.current, latest.current);
    if (!persist) demoAcks.set(storeKey, acked.current);
    setVersion((v) => v + 1);
    return save();
  }, [persist, storeKey, save]);

  const usable = loadedKey === storeKey && ready;
  // First complete snapshot for a new account/child is history, not news.
  useEffect(() => {
    if (!usable || !baseline.current) return;
    baseline.current = false;
    void acknowledge();
  }, [usable, acknowledge]);

  const pending: Milestone | null = useMemo(
    () => (usable && !baseline.current ? latestPending(milestones, acked.current) : null),
    // version bumps after every acknowledgement so this is re-evaluated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usable, milestones, version],
  );
  return { pending, acknowledge };
}
