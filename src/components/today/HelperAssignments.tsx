import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { Card } from "../shared/Card";
import { useAuth } from "../shared/AuthContext";
import { Btn, Err, Rise, T } from "../shared/ui";
import { StatusPill } from "../shared/StatusPill";
import {
  fetchAssignments,
  respondToRequest,
  subscribeToRequests,
} from "../shared/backupApi";
import type { BackupAssignment } from "../shared/backupApi";
import {
  cancelJourney,
  confirmHandover,
  fetchMyJourneys,
  markArrived,
  startJourney,
  subscribeToJourneys,
} from "../shared/pickupJourneyApi";
import type { MyJourney } from "../shared/pickupJourneyApi";
import { JourneySteps } from "./JourneySteps";
import { PickupLocationControls } from "./PickupLocation";

// Shown on Today only when someone has asked THIS signed-in person to collect a child.
// This is the helper's side of a real (non-simulated) backup request. Renders nothing otherwise.
export function HelperAssignments() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<BackupAssignment[]>([]);
  const [journeys, setJourneys] = useState<MyJourney[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false); // state is async, so a fast double tap needs a ref to be refused
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res, mine] = await Promise.all([fetchAssignments(), fetchMyJourneys()]);
    // A failed background load just keeps what is shown. It is not an error for people who are not helpers.
    if (res.ok) setItems(res.data);
    if (mine.ok) setJourneys(mine.data);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load();
    const unsubscribeRequests = subscribeToRequests(`helper-${userId}`, () => void load());
    const unsubscribeJourneys = subscribeToJourneys(`helper-${userId}`, () => void load());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => {
      unsubscribeRequests();
      unsubscribeJourneys();
      appState.remove();
    };
  }, [userId, load]);

  const run = async (item: BackupAssignment, action: () => Promise<{ ok: boolean; error?: string }>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(item.request_id);
    setActionError(null);
    try {
      const res = await action();
      if (!res.ok) setActionError(res.error ?? "Something went wrong. Please try again.");
      await load();
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => {
        const busy = busyId === item.request_id;
        const journey = journeys.find((j) => j.backup_request_id === item.request_id);
        return (
          <Rise key={item.request_id} kind="swap">
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <T s={1.05} w={700} lh={1.3}>
                    {item.requested_by_name} asked you to collect {item.child_name}
                  </T>
                  {item.school_name ? (
                    <T s={0.9} c="muted" lh={1.4}>
                      {item.school_name}
                      {item.school_address ? `, ${item.school_address}` : ""}
                    </T>
                  ) : null}
                </View>
                <StatusPill label={item.state === "requested" ? "Needs your answer" : "You accepted"} tone={item.state === "requested" ? "warning" : "success"} />
              </View>

              {item.state === "requested" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <Btn kind="p" flex loading={busy} disabled={busy} onPress={() => void run(item, () => respondToRequest(item.request_id, true))}>
                    Yes, I can collect
                  </Btn>
                  <Btn kind="o" flex disabled={busy} onPress={() => void run(item, () => respondToRequest(item.request_id, false))}>
                    I cannot
                  </Btn>
                </View>
              ) : (
                <JourneySteps
                  childName={item.child_name}
                  step={journey ? journey.state : "none"}
                  busy={busy}
                  startLabel="Start journey"
                  onStart={() => void run(item, () => startJourney(item.child_id))}
                  onArrived={() => journey && void run(item, () => markArrived(journey.journey_id))}
                  onHandover={() => journey && void run(item, () => confirmHandover(journey.journey_id))}
                  onCancel={() => journey && void run(item, () => cancelJourney(journey.journey_id))}
                />
              )}
              {journey ? <PickupLocationControls journeyId={journey.journey_id} /> : null}
            </Card>
          </Rise>
        );
      })}
      {actionError ? <Err text={actionError} /> : null}
    </View>
  );
}
