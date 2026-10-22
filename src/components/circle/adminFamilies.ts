// Discovery is an RLS-protected read. Every mutation still rechecks admin rights on the server.
export type AdminFamily = { id: string; name: string };
export type MembershipPage = (userId: string, from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export async function loadAdminFamilies(userId: string, page: MembershipPage): Promise<AdminFamily[]> {
  const families = new Map<string, AdminFamily>();
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await page(userId, offset, offset + pageSize - 1);
    if (error) throw new Error("Unable to load administrator families. Try again.");
    if (!Array.isArray(data)) throw new Error("Unexpected family membership response.");
    for (const row of data) {
      if (!isRecord(row) || row.user_id !== userId || row.role !== "admin" || typeof row.family_id !== "string" || !isRecord(row.families) || row.families.id !== row.family_id || typeof row.families.name !== "string") throw new Error("Unexpected family membership response.");
      families.set(row.family_id, { id: row.family_id, name: row.families.name });
    }
    if (data.length < pageSize) break;
  }
  return [...families.values()];
}
export function selectAdminFamily(families: readonly AdminFamily[], selected: string | null, currentFamily: string | null): string | null {
  return families.find(family => family.id === selected)?.id
    ?? families.find(family => family.id === currentFamily)?.id
    ?? families[0]?.id ?? null;
}
