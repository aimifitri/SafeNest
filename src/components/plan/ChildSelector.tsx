import { useRef, useState } from "react";
import { View } from "react-native";
import { ChildForm } from "../household/ChildForm";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { Press, T, useColors } from "../shared/ui";
import { Icon } from "../navigation/Icon";
export function ChildSelector() {
  const h = useHousehold();
  const colors = useColors();
  const { profile } = useAuth();
  const canAdd = h.demo || profile?.accountType === "parent";
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState(false);
  const lock = useRef(false);
  return <>
    <SectionHeading title="Select child" />
    <Card>
      <Press label={`Select child, ${h.child?.name ?? "No children yet"}`} onPress={() => setOpen(value => !value)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar name={h.child?.name ?? "?"} size={44} />
        <View style={{ flex: 1 }}><T w={800}>{h.child?.name ?? "No children yet"}</T><T c="muted" s={0.84}>{[h.child?.className, h.child?.schoolName].filter(Boolean).join(", ") || "Add a child and school"}</T></View>
        <View style={{ transform: [{ rotate: open ? "270deg" : "90deg" }] }}><Icon name="chev" size={20} color={colors.primary} /></View>
      </Press>
      {open ? <View style={{ gap: 8 }}>
        {h.children.map(child => <Press key={child.id} label={`Select ${child.name}`} state={{ selected: child.id === h.child?.id }} onPress={() => { h.selectChild(child.id); setOpen(false); }} style={{ minHeight: 48, justifyContent: "center" }}><T w={child.id === h.child?.id ? 800 : 400}>{child.name}</T><T s={0.8} c="muted">{[child.className, child.schoolName].filter(Boolean).join(", ")}</T></Press>)}
        <Press label="Add another child" disabled={!canAdd} onPress={() => { setOpen(false); setAdd(true); }} style={{ minHeight: 48, justifyContent: "center", opacity: canAdd ? 1 : 0.5 }}><T w={800}>+ Add another child</T></Press>
        {!canAdd ? <T c="muted">A parent or guardian can register a child.</T> : null}
      </View> : null}
    </Card>
    <Sheet visible={add} onClose={() => setAdd(false)} title="Add another child" closeLabel="Close child form">
      {add ? <ChildForm submitLabel={h.demo ? "Add demo child" : "Save child"} onCancel={() => setAdd(false)} onSubmit={async draft => {
        if (lock.current) return "A child is already being saved.";
        lock.current = true;
        try { const result = await h.addChild(draft); if (!result.ok) return result.error; setAdd(false); return null; }
        finally { lock.current = false; }
      }} /> : null}
      <T c="muted" s={0.8}>{h.demo ? "Demo only: child profiles and plans are held in memory and reset when you exit Demo Mode." : "Uses the existing household child API. Server authorization applies; unavailable operations report an error."}</T>
    </Sheet>
  </>;
}
