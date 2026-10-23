import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";
import { uniqueChannelName } from "../shared/realtimeChannel";
import type { SharedMapLocation } from "./todayMapModel";

type ShareRow = { id: string; owner_user_id: string; owner_display_name: string; expires_at: string };
type LiveRow = { share_id: string; latitude: number; longitude: number; updated_at: string };

/**
 * Live locations that other people chose to share with THIS account (the existing trip sharing:
 * location_shares and live_locations, protected by row level security). Reads only. It never creates
 * a location and never writes anything. Real accounts only. If the SQL is not installed, or nobody is
 * sharing, the list is empty and the map says so.
 */
export function useSharedLocations(enabled: boolean, userId: string | null) {
  const [items, setItems] = useState<SharedMapLocation[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled || !userId) { setItems([]); setError(false); return; }
    let live = true;
    const load = async () => {
      const shares = await supabase.from("location_shares").select("id, owner_user_id, owner_display_name, expires_at")
        .neq("owner_user_id", userId).is("ended_at", null).gt("expires_at", new Date().toISOString());
      if (!live) return;
      if (shares.error) { setItems([]); setError(true); return; }
      const rows = (shares.data ?? []) as ShareRow[];
      if (rows.length === 0) { setItems([]); setError(false); return; }
      const points = await supabase.from("live_locations").select("share_id, latitude, longitude, updated_at").in("share_id", rows.map((r) => r.id));
      if (!live) return;
      if (points.error) { setItems([]); setError(true); return; }
      const byShare = new Map(((points.data ?? []) as LiveRow[]).map((p) => [p.share_id, p]));
      setError(false);
      setItems(rows.flatMap((r) => {
        const p = byShare.get(r.id);
        return p ? [{ id: r.id, userId: r.owner_user_id, name: r.owner_display_name, latitude: p.latitude, longitude: p.longitude, updatedAt: Date.parse(p.updated_at), expiresAt: Date.parse(r.expires_at) }] : [];
      }));
    };
    void load();
    const channel = supabase.channel(uniqueChannelName(`today-shared-${userId}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_locations" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "location_shares" }, () => void load())
      .subscribe();
    return () => { live = false; void supabase.removeChannel(channel); };
  }, [enabled, userId]);
  return { items, error };
}
