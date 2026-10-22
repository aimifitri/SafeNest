import { useState } from "react";
import { Linking, Share, View } from "react-native";

import { Avatar } from "../shared/Avatar";
import { clock } from "../shared/circleEngine";
import { mockData } from "../shared/mockData";
import { Sheet } from "../shared/Sheet";
import { isLongWait, photoMessage, teacherMessage, whatsappUrl } from "../shared/teacherMessages";
import type { MsgLang } from "../shared/teacherMessages";
import { Btn, Err, Seg, T, useColors } from "../shared/ui";

// Messages to the class teacher. SafeNest only prepares the words. The parent reads them and sends them
// themselves from WhatsApp or the share sheet. The app cannot see whether the teacher got or read it.

function LangPick({ lang, onPick }: { lang: MsgLang; onPick: (l: MsgLang) => void }) {
  return <Seg<MsgLang> opts={[{ value: "ms", label: "Bahasa Melayu", a11y: "Write in Bahasa Melayu" }, { value: "en", label: "English", a11y: "Write in English" }]} cur={lang} onPick={onPick} />;
}

function MessageBox({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 14 }}>
      <T s={0.95} lh={1.5}>{text}</T>
    </View>
  );
}

function SendButtons({ text, onSent, simulated }: { text: string; onSent: () => void; simulated: boolean }) {
  const [error, setError] = useState("");
  const { school } = mockData;
  const url = whatsappUrl(school.teacherPhone, text);
  const openWhatsApp = async () => {
    setError("");
    if (!url) { setError("The teacher's phone number looks incomplete. Use Share instead."); return; }
    try {
      await Linking.openURL(url);
      onSent();
    } catch {
      setError("WhatsApp could not be opened. Use Share instead.");
    }
  };
  const share = async () => {
    setError("");
    try {
      const res = await Share.share({ message: text });
      if (res.action === Share.sharedAction) onSent();
    } catch {
      setError("The share sheet could not be opened.");
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Btn kind="p" icon="chat" onPress={() => void openWhatsApp()}>Open in WhatsApp</Btn>
      <Btn kind="s" onPress={() => void share()}>Share or copy message</Btn>
      {error ? <Err text={error} /> : null}
      <T s={0.8} c="muted" lh={1.4} align="center">
        {simulated ? "Demo. Nothing is sent from here. " : ""}SafeNest does not send this. You send it, and SafeNest cannot see if the teacher read it.
      </T>
    </View>
  );
}

/** "X will pick up Laila. Here is their photo so you can check." */
export function TeacherPhotoSheet(props: {
  visible: boolean; onClose: () => void; onSent: () => void; simulated: boolean;
  collector: string; collectorRole: string; dismiss: number;
}) {
  const { child, school } = mockData;
  const [lang, setLang] = useState<MsgLang>("ms");
  const text = photoMessage(lang, { teacher: school.teacher, child: child.name, className: child.className, collector: props.collector, collectorRole: props.collectorRole, dismiss: props.dismiss });
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title={`Send photo to ${school.teacher}`} closeLabel="Close teacher message">
      <T c="muted" lh={1.4}>{school.teacher} checks {props.collector} before {child.name} leaves. Review the words, then send them with the photo.</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={props.collector} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={800} s={1.1}>{props.collector}</T>
          <T s={0.85} c="muted" lh={1.35}>{[props.collectorRole, props.simulated ? "Demo photo on file" : "Photo on file"].filter(Boolean).join(" · ")}</T>
        </View>
      </View>
      <LangPick lang={lang} onPick={setLang} />
      <MessageBox text={text} />
      <SendButtons text={text} simulated={props.simulated} onSent={() => { props.onSent(); props.onClose(); }} />
    </Sheet>
  );
}

/** "I cannot get to school by 1:00 PM. I will leave at X and arrive around Y." */
export function TeacherLateSheet(props: {
  visible: boolean; onClose: () => void; onSent: () => void; simulated: boolean;
  dismiss: number; leaveAt: number; travelMin: number | null;
}) {
  const { child, school } = mockData;
  const [lang, setLang] = useState<MsgLang>("ms");
  const arrival = props.travelMin === null ? null : props.leaveAt + props.travelMin;
  const text = teacherMessage(lang, { teacher: school.teacher, child: child.name, className: child.className, dismiss: props.dismiss, leaveAt: props.leaveAt, arrival });
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title="Message the teacher" closeLabel="Close teacher message">
      <T c="muted" lh={1.4}>Tell {school.teacher} you will be late so {child.name} waits at the school office. Review the words, then send them yourself.</T>
      <LangPick lang={lang} onPick={setLang} />
      <MessageBox text={text} />
      <SendButtons text={text} simulated={props.simulated} onSent={() => { props.onSent(); props.onClose(); }} />
    </Sheet>
  );
}

/** "I will come myself": when will you leave? */
export function LeaveSheet(props: {
  visible: boolean; onClose: () => void; simulated: boolean;
  nowMin: number; dismiss: number; travelMin: number | null; canAskAgain: boolean;
  onConfirm: (leaveAt: number) => void; onAskAgain: () => void;
}) {
  const c = useColors();
  const { child, school } = mockData;
  const [leaveAt, setLeaveAt] = useState(props.nowMin);
  const [seen, setSeen] = useState(false);
  if (props.visible && !seen) { setSeen(true); setLeaveAt(props.nowMin); }
  if (!props.visible && seen) setSeen(false);
  const arrival = props.travelMin === null ? null : leaveAt + props.travelMin;
  const long = arrival !== null && isLongWait(arrival, props.dismiss);
  const step = (d: number) => setLeaveAt((v) => Math.max(props.nowMin, Math.min(23 * 60 + 55, v + d)));
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title="When will you leave?"
      closeLabel="Close leave time"
      footer={<Btn kind="p" icon="check" onPress={() => props.onConfirm(leaveAt)}>Confirm leave time</Btn>}
    >
      <T c="muted" lh={1.4}>Nobody else can collect {child.name}, so you will. Pick when you can leave. You can then message {school.teacher}.</T>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 10 }}>
        <Btn kind="o" sm onPress={() => step(-5)} label="Leave 5 minutes earlier">-5 min</Btn>
        <View style={{ alignItems: "center", flexShrink: 1 }}>
          <T s={0.8} c="muted">I will leave at</T>
          <T s={1.7} w={800} tab ls={-0.02}>{clock(leaveAt)}</T>
        </View>
        <Btn kind="o" sm onPress={() => step(5)} label="Leave 5 minutes later">+5 min</Btn>
      </View>
      <T s={0.9} c="muted" lh={1.4}>
        {arrival !== null ? `You should arrive about ${clock(arrival)}. School ends at ${clock(props.dismiss)}.${props.simulated ? " Demo estimate." : ""}` : `School ends at ${clock(props.dismiss)}. SafeNest cannot estimate your trip right now.`}
      </T>
      {long ? (
        <View style={{ borderRadius: 14, backgroundColor: c.warning, padding: 14, gap: 8 }}>
          <T w={800} c={c.warningInk}>That is a long wait for {child.name}</T>
          <T s={0.9} c={c.warningInk} lh={1.4}>{child.name} would wait more than an hour after school ends.</T>
          {props.canAskAgain ? <Btn kind="s" onPress={props.onAskAgain}>Ask everyone again</Btn> : null}
        </View>
      ) : null}
    </Sheet>
  );
}
