import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { Card } from "../shared/Card";
import { SHEET_ACTIONS } from "../shared/pickupFlow";
import type { ActionId, FlowAction } from "../shared/pickupFlow";
import { StatusPill } from "../shared/StatusPill";
import { Btn, Err, Press, Rise, T, useEffectiveScale, useTone } from "../shared/ui";
import { CircleRows } from "./CircleRows";
import { CollectorCard, StepBar } from "./JourneyProgress";
import { LeaveSheet, TeacherLateSheet, TeacherPhotoSheet } from "./TeacherSheets";
import type { usePickupFlow } from "./usePickupFlow";
import { useSoundEffects } from "../shared/SoundEffects";

type Flow = ReturnType<typeof usePickupFlow>;
type OpenSheet = null | "photo" | "late" | "leave";

// Today's one status card. It shows the single phase from derivePickupFlow(): who is responsible,
// when school ends, whether they can arrive in time, who was asked, and the next step.
// Nothing here decides anything. Pressing "Find trusted backup" asks EVERYONE eligible at once.
export function PickupStatusCard({ pf, childName }: { pf: Flow; childName: string }) {
  const { flow } = pf;
  const { playPickupChime } = useSoundEffects();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [more, setMore] = useState(false);
  const [why, setWhy] = useState(false);
  const [people, setPeople] = useState(false);
  const [confirmHandover, setConfirmHandover] = useState(false);
  const [pending, setPending] = useState<ActionId | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const seen = useRef(false);

  // A new situation closes anything left open from the old one.
  useEffect(() => {
    setMore(false);
    setConfirmHandover(false);
    setPending(null);
    setHint(null);
    seen.current = true;
  }, [flow.phase]);

  const locked = pending !== null || pf.busy;

  const press = async (id: ActionId) => {
    if (locked) return;
    if (SHEET_ACTIONS.has(id)) {
      setSheet(id === "come_myself" ? "leave" : id === "message_teacher" ? "late" : "photo");
      return;
    }
    if (id === "confirm_handover" && !confirmHandover) { setConfirmHandover(true); return; }
    if (id === "start_journey" || id === "find_backup" || id === "ask_again" || id === "confirm_handover") playPickupChime();
    setPending(id);
    setHint(null);
    try {
      const ok = await pf.run(id);
      if (!ok && (id === "find_backup" || id === "ask_again")) {
        setHint(pf.groupRequests === false
          ? "No approved helper who has joined SafeNest can be asked yet."
          : "Nobody was asked. Check that your family and Trusted Circle have approved, joined members.");
      }
    } finally {
      setPending(null);
    }
  };

  const variant = flow.tone === "warning" || flow.tone === "danger" ? "warning" : "hero";
  const prominentPair = flow.phase === "late" || flow.phase === "ask_now" || flow.phase === "nobody";
  const small = flow.phase === "on_time" || flow.phase === "asking" || flow.phase === "travelling" || flow.phase === "at_school";

  const button = (action: FlowAction, kind: "p" | "o" | "s", sm = false) => (
    <Btn key={action.id} kind={kind} sm={sm} loading={pending === action.id} disabled={locked} onPress={() => void press(action.id)}>
      {action.label}
    </Btn>
  );

  const footer = flow.simulated
    ? "Simulated demo. Nobody is contacted and no location is used."
    : flow.estimate === "route"
      ? "Travel time comes from a public route service and does not include live traffic."
      : null;

  return (
    <>
      <Rise key={flow.phase} kind={seen.current ? "swap" : "rise"} i={1}>
        <Card variant={variant}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <StatusPill label={flow.status} tone={flow.tone} />
            {flow.simulated ? <DemoTag /> : null}
          </View>
          <View style={{ marginTop: 12 }}>
            <T s={1.5} w={800} ls={-0.025} lh={1.2}>{flow.headline}</T>
          </View>
          <View style={{ marginTop: 6 }}>
            <T s={0.95} lh={1.4} c="muted">{flow.detail}</T>
          </View>
          {flow.showCollector ? <CollectorCard name={pf.collector.name} role={pf.collectorRole} simulated={flow.simulated} /> : null}
          <Facts items={flow.showCollector ? flow.facts.filter((f) => f.label !== "Collector") : flow.facts} />
          {flow.steps ? <StepBar steps={flow.steps} /> : null}

          {flow.recipientsView === "open" ? <CircleRows rows={flow.recipients} /> : null}

          {confirmHandover ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <T s={0.9} lh={1.4} c="muted">This records that {childName} is with you and ends the journey. The school does not verify it.</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Btn kind="p" flex loading={pending === "confirm_handover"} disabled={locked} onPress={() => void press("confirm_handover")}>Yes, confirm</Btn>
                <Btn kind="o" flex disabled={locked} onPress={() => setConfirmHandover(false)}>Not yet</Btn>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 14 }}>
              {flow.primary ? button(flow.primary, "p") : null}
              {flow.secondary ? button(flow.secondary, prominentPair ? "s" : "o", small) : null}
              {flow.more.length > 0 ? (
                <>
                  <Press onPress={() => setMore((v) => !v)} label={more ? "Hide more options" : "More options"} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
                    <T s={0.88} w={600} c="muted">{more ? "Hide options" : "More options"}</T>
                  </Press>
                  {more ? flow.more.map((a) => button(a, "o", true)) : null}
                </>
              ) : null}
            </View>
          )}

          {flow.demoActions.length > 0 ? (
            <View style={{ gap: 8, marginTop: 14 }}>
              <T s={0.74} w={700} up ls={0.04} c="muted">Demo actions. Simulated, nobody is contacted.</T>
              {flow.demoActions.map((a) => (
                <Btn key={a.id} kind="dash" loading={pending === a.id} disabled={locked} onPress={() => void press(a.id)}>{a.label}</Btn>
              ))}
            </View>
          ) : null}

          {flow.note ? <View style={{ marginTop: 12 }}><T s={0.85} lh={1.4} c="muted">{flow.note}</T></View> : null}

          {hint ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <T s={0.88} w={700} lh={1.35}>{hint}</T>
              <Link href="/circle" asChild>
                <Press label="Open Trusted Circle" role="link" style={{ minHeight: 44, justifyContent: "center" }}>
                  <T w={700} c="muted" style={{ textDecorationLine: "underline" }}>Open Trusted Circle</T>
                </Press>
              </Link>
            </View>
          ) : null}
          {pf.error ? <View style={{ marginTop: 12 }}><Err text={pf.error} /></View> : null}

          {flow.recipientsView === "tucked" && flow.recipients.length > 0 ? (
            <View style={{ marginTop: 6 }}>
              <Press onPress={() => setPeople((v) => !v)} label="Who answered" style={{ minHeight: 44, justifyContent: "center" }}>
                <T s={0.82} w={600} c="muted" style={{ textDecorationLine: "underline" }}>{people ? "Hide who answered" : "Who answered"}</T>
              </Press>
              {people ? <CircleRows rows={flow.recipients} /> : null}
            </View>
          ) : null}

          {flow.rule ? (
            <View style={{ marginTop: 6 }}>
              <Press onPress={() => setWhy((v) => !v)} label="How SafeNest decides" style={{ minHeight: 44, justifyContent: "center" }}>
                <T s={0.82} w={600} c="muted" style={{ textDecorationLine: "underline" }}>How SafeNest decides</T>
              </Press>
              {why ? <T s={0.82} lh={1.4} c="muted">{flow.rule}</T> : null}
            </View>
          ) : null}
          {footer ? (
            <View style={{ marginTop: 8 }}>
              <T s={0.78} lh={1.35} c="muted" align="center">{footer}</T>
            </View>
          ) : null}
        </Card>
      </Rise>

      <TeacherPhotoSheet
        visible={sheet === "photo"}
        onClose={() => setSheet(null)}
        onSent={pf.markMessageSent}
        simulated={flow.simulated}
        collector={pf.collector.name}
        collectorRole={pf.collectorRole}
        dismiss={pf.dismissMin}
      />
      <TeacherLateSheet
        visible={sheet === "late"}
        onClose={() => setSheet(null)}
        onSent={() => undefined}
        simulated={flow.simulated}
        dismiss={pf.dismissMin}
        leaveAt={pf.leaveAt ?? pf.nowMin}
        travelMin={pf.travelMin}
      />
      <LeaveSheet
        visible={sheet === "leave"}
        onClose={() => setSheet(null)}
        simulated={flow.simulated}
        nowMin={pf.nowMin}
        dismiss={pf.dismissMin}
        travelMin={pf.travelMin}
        canAskAgain={flow.secondary?.id === "ask_again"}
        onConfirm={(leaveAt) => { setSheet(null); void pf.run("come_myself", { leaveAt }); }}
        onAskAgain={() => { setSheet(null); void press("ask_again"); }}
      />
    </>
  );
}

function DemoTag() {
  const tone = useTone();
  return (
    <View style={{ borderWidth: 1, borderColor: tone === "warn" ? "rgba(94,75,0,.4)" : "rgba(255,255,255,.4)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <T s={0.72} w={700} up ls={0.04}>Demo</T>
    </View>
  );
}

/** Two key facts. Side by side when there is room, stacked when the card is narrow or text is large. */
function Facts({ items }: { items: Array<{ label: string; value: string; note?: string }> }) {
  const scale = useEffectiveScale();
  const tone = useTone();
  const [w, setW] = useState(0);
  const stacked = w > 0 && w / items.length < 150 * Math.max(1, scale);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: stacked ? "column" : "row", gap: 8, marginTop: 14 }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{ flex: stacked ? undefined : 1, minWidth: 0, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: tone === "warn" ? "rgba(94,75,0,.1)" : "rgba(255,255,255,.1)" }}
        >
          <T s={0.7} w={600} ls={0.02} up lh={1.3} style={{ opacity: 0.8 }}>{item.label}</T>
          <T s={1.3} w={800} tab lh={1.2}>{item.value}</T>
          {item.note ? <T s={0.78} lh={1.3} c="muted">{item.note}</T> : null}
        </View>
      ))}
    </View>
  );
}
