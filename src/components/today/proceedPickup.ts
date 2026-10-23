// Serializes commitment -> close modal -> GPS handoff. A late success cannot navigate after blur/child change.
export function createProceedPickup() {
  let generation = 0;
  let busy = false;
  return {
    invalidate() { generation++; busy = false; },
    async run(commit: () => Promise<boolean>, isCurrent: () => boolean, succeeded: () => void): Promise<"success" | "failed" | "cancelled" | "busy"> {
      if (busy) return "busy";
      busy = true; const mine = generation;
      try {
        const ok = await commit();
        if (mine !== generation || !isCurrent()) return "cancelled";
        if (!ok) return "failed";
        succeeded(); return "success";
      } catch { return mine === generation && isCurrent() ? "failed" : "cancelled"; }
      finally { if (mine === generation) busy = false; }
    },
  };
}

export function schoolNavigationTarget(child: { id: string }, school: { name: string; address: string }, point: { latitude: number; longitude: number } | null) {
  const valid = point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
  return { childId: child.id, name: school.name, address: school.address, coordinate: valid ? point : null };
}
