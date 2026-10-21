import { useCallback, useEffect, useState } from "react";
import { AppState, View } from "react-native";

import { Card } from "../shared/Card";
import { useAuth } from "../shared/AuthContext";
import { Btn, Err, Rise, T } from "../shared/ui";
import { StatusPill } from "../shared/StatusPill";
import {
  completeRequest,
  fetchAssignments,
  respondToRequest,
  subscribeToRequests,
} from "../shared/backupApi";
import type { BackupAssignment } from "../shared/backupApi";

// Shown on Today only when someone has asked THIS signed-in person to collect a child.
// This is the helper's side of a real (non-simulated) backup request. Renders nothing otherwise.
export function HelperAssignments() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [items, setItems] = useState<BackupAssignment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchAssignments();
    // A failed background load just keeps what is shown. It is not an error for people who are not helpers.
    if (res.ok) setItems(res.data);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void load();
    const unsubscribe = subscribeToRequests(`helper-${userId}`, () => void load());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void load();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [userId, load]);

  const run = async (item: BackupAssignment, action: () => ReturnType<typeof respondToRequest>) => {
    if (busyId) return;
    setBusyId(item.request_id);
    setActionError(null);
    const res = await action();
    if (!res.ok) setActionError(res.error);
    await load();
    setBusyId(null);
  };

  if (items.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => {
        const busy = busyId === item.request_id;
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
                <Btn kind="p" loading={busy} disabled={busy} onPress={() => void run(item, () => completeRequest(item.request_id))}>
                  I have collected {item.child_name}
                </Btn>
              )}
            </Card>
          </Rise>
        );
      })}
      {actionError ? <Err text={actionError} /> : null}
    </View>
  );
}
