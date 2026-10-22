import { useEffect, useRef, useState } from "react";
import { uniqueChannelName } from "../shared/realtimeChannel";
import { View } from "react-native";

import { supabase } from "../../lib/supabase";
import { Icon } from "../navigation/Icon";
import { useAuth } from "../shared/AuthContext";
import { Btn, Press, T } from "../shared/ui";
import { DeviceLocationMap } from "./DeviceLocationMap";

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

type Guardian = {
  id: string;
  user_id: string;
  name: string;
  role: string;
};

type IncomingShare = {
  id: string;
  owner_display_name: string;
  expires_at: string;
};

type SharedLocation = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  updated_at: string;
};

export function TripSharing({ visible, tracking, point }: { visible: boolean; tracking: boolean; point: LocationPoint | null }) {
  const { session, familyId } = useAuth();
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<IncomingShare[]>([]);
  const [activeShareId, setActiveShareId] = useState<string | null>(null);
  const [viewingShare, setViewingShare] = useState<IncomingShare | null>(null);
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const shareIdRef = useRef<string | null>(null);
  const lastUploadAt = useRef(0);

  useEffect(() => {
    if (!visible || !familyId || !session?.user.id) return;
    let current = true;
    const loadSharingData = async () => {
      setLoading(true);
      setError("");
      const [guardianResult, incomingResult] = await Promise.all([
        supabase
          .from("trusted_helpers")
          .select("id, user_id, name, role")
          .eq("family_id", familyId)
          .eq("state", "active")
          .not("user_id", "is", null)
          .neq("user_id", session.user.id),
        supabase
          .from("location_shares")
          .select("id, owner_display_name, expires_at")
          .neq("owner_user_id", session.user.id)
          .is("ended_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);
      if (!current) return;
      setGuardians((guardianResult.data ?? []) as Guardian[]);
      if (guardianResult.error || incomingResult.error) {
        setError("Could not load sharing access. Apply the location sharing SQL migration and try again.");
      } else {
        setIncoming((incomingResult.data ?? []) as IncomingShare[]);
      }
      setLoading(false);
    };
    void loadSharingData();
    const channel = supabase
      .channel(uniqueChannelName(`location-shares-${session.user.id}`))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "location_shares",
      }, () => void loadSharingData())
      .subscribe();
    return () => {
      current = false;
      void supabase.removeChannel(channel);
    };
  }, [visible, familyId, session?.user.id]);

  const uploadPoint = async (shareId: string, next: LocationPoint, force = false) => {
    const now = Date.now();
    if (!force && now - lastUploadAt.current < 10000) return;
    lastUploadAt.current = now;
    const { error: uploadError } = await supabase.from("live_locations").upsert({
      share_id: shareId,
      latitude: next.latitude,
      longitude: next.longitude,
      accuracy_m: next.accuracy,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: "share_id" });
    if (uploadError) {
      lastUploadAt.current = 0;
      setError("The live location could not be sent. Check your connection.");
    }
  };

  useEffect(() => {
    if (!visible || !tracking || !point || !activeShareId) return;
    void uploadPoint(activeShareId, point);
  }, [visible, tracking, point, activeShareId]);

  useEffect(() => {
    if (!visible || !viewingShare) return;
    let current = true;
    const channel = supabase
      .channel(uniqueChannelName(`live-location-${viewingShare.id}`))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_locations",
        filter: `share_id=eq.${viewingShare.id}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setSharedLocation(null);
          return;
        }
        setSharedLocation(payload.new as SharedLocation);
      })
      .subscribe();

    void supabase
      .from("live_locations")
      .select("latitude, longitude, accuracy_m, updated_at")
      .eq("share_id", viewingShare.id)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (!current) return;
        if (readError) {
          setError("This shared location is no longer available.");
          setViewingShare(null);
          return;
        }
        setSharedLocation((data ?? null) as SharedLocation | null);
      });

    return () => {
      current = false;
      void supabase.removeChannel(channel);
    };
  }, [visible, viewingShare]);

  const toggleRecipient = (userId: string) => {
    setSelectedIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const startSharing = async () => {
    if (!familyId || !tracking || !point || selectedIds.length === 0 || loading) return;
    setLoading(true);
    setError("");
    const { data, error: startError } = await supabase.rpc("start_location_share", {
      target_family: familyId,
      recipient_user_ids: selectedIds,
    });
    if (startError || typeof data !== "string") {
      setError("Could not start sharing. Confirm the SQL migration is installed and the selected guardians are linked and approved.");
      setLoading(false);
      return;
    }

    shareIdRef.current = data;
    setActiveShareId(data);
    lastUploadAt.current = 0;
    await uploadPoint(data, point, true);
    setLoading(false);
  };

  const stopSharing = async () => {
    const shareId = shareIdRef.current;
    if (!shareId) return;
    setLoading(true);
    const { error: stopError } = await supabase.rpc("end_location_share", { target_share: shareId });
    if (stopError) {
      setError("Could not end sharing on the server. Keep this screen open and try again.");
      setLoading(false);
      return;
    }
    shareIdRef.current = null;
    setActiveShareId(null);
    lastUploadAt.current = 0;
    setLoading(false);
  };

  useEffect(() => {
    if (!tracking && activeShareId) void stopSharing();
  }, [tracking, activeShareId]);

  useEffect(() => {
    if (visible) return;
    const shareId = shareIdRef.current;
    shareIdRef.current = null;
    setActiveShareId(null);
    setSelectedIds([]);
    if (shareId) void supabase.rpc("end_location_share", { target_share: shareId });
  }, [visible]);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <T s={0.72} w={700} c="muted">SHARE THIS TRIP</T>
        <T s={0.84} c="muted" lh={1.35}>Only linked, approved guardians can receive live updates. Sharing ends when you close this screen or after 4 hours.</T>
      </View>

      {guardians.length ? guardians.map((guardian) => {
        const selected = selectedIds.includes(guardian.user_id);
        return (
          <Press
            key={guardian.user_id}
            onPress={() => toggleRecipient(guardian.user_id)}
            disabled={Boolean(activeShareId) || !tracking}
            label={`${selected ? "Remove" : "Share with"} ${guardian.name}`}
            style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: selected ? "#218975" : "#D6DFDC", borderRadius: 12, opacity: tracking ? 1 : 0.55 }}
          >
            <Icon name={selected ? "check" : "circle"} size={18} color={selected ? "#218975" : "#697975"} stroke={2} />
            <View style={{ flex: 1 }}>
              <T s={0.9} w={700}>{guardian.name}</T>
              <T s={0.76} c="muted">{guardian.role}</T>
            </View>
          </Press>
        );
      }) : (
        <T s={0.84} c="muted" lh={1.35}>{loading ? "Loading approved guardians..." : "No linked, approved guardians can receive location yet."}</T>
      )}

      {activeShareId ? (
        <View style={{ gap: 8 }}>
          <T s={0.85} w={700} c="#176B5D">Live trip sharing is on for {selectedIds.length} guardian{selectedIds.length === 1 ? "" : "s"}.</T>
          <Btn kind="o" icon="cantx" color="#A63F37" onPress={() => void stopSharing()} disabled={loading}>Stop sharing now</Btn>
        </View>
      ) : (
        <Btn kind="p" icon="userplus" onPress={() => void startSharing()} disabled={!tracking || selectedIds.length === 0 || loading}>
          {loading ? "Preparing sharing..." : "Start sharing this trip"}
        </Btn>
      )}

      {incoming.length ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          <T s={0.72} w={700} c="muted">SHARED WITH YOU</T>
          {incoming.map((share) => {
            const selected = viewingShare?.id === share.id;
            return (
              <Press key={share.id} onPress={() => setViewingShare(selected ? null : share)} label={`${selected ? "Hide" : "View"} ${share.owner_display_name}'s live location`} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: selected ? "#E1F2EC" : "transparent" }}>
                <Icon name="look" size={16} color="#176B5D" stroke={2} />
                <T s={0.86} w={700} style={{ flex: 1 }}>{share.owner_display_name}</T>
                <T s={0.76} c="muted">{selected ? "Hide" : "View"}</T>
              </Press>
            );
          })}
          {viewingShare ? sharedLocation ? (
            <View style={{ height: 220, overflow: "hidden", borderRadius: 12 }}>
              <DeviceLocationMap point={{
                latitude: sharedLocation.latitude,
                longitude: sharedLocation.longitude,
                accuracy: sharedLocation.accuracy_m,
                title: viewingShare.owner_display_name,
                detail: `Updated ${new Date(sharedLocation.updated_at).toLocaleTimeString()}`,
              }} />
              <View style={{ position: "absolute", left: 8, right: 8, bottom: 8, padding: 8, borderRadius: 8, backgroundColor: "white" }}>
                <T s={0.78} w={700}>{`Updated ${new Date(sharedLocation.updated_at).toLocaleTimeString()} · ±${Math.round(sharedLocation.accuracy_m ?? 0)} m`}</T>
              </View>
            </View>
          ) : (
            <T s={0.82} c="muted">Waiting for the guardian's first location update...</T>
          ) : null}
        </View>
      ) : null}

      {error ? <T s={0.82} c="#A63F37" lh={1.4}>{error}</T> : null}
    </View>
  );
}
