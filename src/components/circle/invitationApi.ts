// Authenticated RPCs only. Never log errors or tokens, or retry mutations automatically.
export type Rpc = (name: string, args: Record<string, string>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
export type Invitation = { helper_id: string; invite_token: string; expires_at: string };
export type Approval = { membership_id: string; family_id: string; helper_name: string; relationship: string; accepting_account_id: string; accepting_account_name: string | null; accepted_at: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
export const validToken = (value: string) => /^[0-9a-f]{64}$/.test(value);
function errorText(code?: string): string {
  if (code === "28000" || code === "PGRST301" || code === "PGRST303") return "Please sign in again before continuing.";
  if (code === "42501") return "Permission denied. This operation requires the correct account profile or family administrator.";
  if (code === "22023") return "Invitation unavailable: it may be invalid, expired, revoked or already used. Check Joined Circles before requesting a new invitation.";
  if (code === "55000" || code === "23505") return "This request has already changed or is not eligible. Refresh the approval queue and Joined Circles.";
  if (code === "PGRST202" || code === "42883" || code === "42P01") return "Secure invitations are not available on this server. Ask the project administrator to verify the reviewed backend deployment.";
  return "Unable to confirm the result. Check your connection, then refresh Joined Circles or the approval queue before retrying. Invitation creation may have succeeded; do not repeatedly generate invitations.";
}
export function createInvitationApi(rpc: Rpc) {
  async function call<T>(name: string, args: Record<string, string>, validate: (data: unknown) => data is T): Promise<Result<T>> {
    try {
      const { data, error } = await rpc(name, args);
      if (error) return { ok: false, error: errorText(error.code) };
      return validate(data) ? { ok: true, data } : { ok: false, error: "The server returned an unexpected response. Refresh before retrying." };
    } catch { return { ok: false, error: errorText() }; }
  }
  return {
    create(familyId: string, name: string, relationship: string): Promise<Result<Invitation[]>> {
      if (!uuid(familyId) || !name.trim() || name.trim().length > 200 || relationship.trim().length > 200) return Promise.resolve({ ok: false, error: "Provide a helper name and relationship of at most 200 characters." });
      return call("create_helper_with_invite", { target_family: familyId, helper_name: name.trim(), relationship: relationship.trim() }, (data): data is Invitation[] => Array.isArray(data) && data.length === 1 && data.every(row => record(row) && uuid(row.helper_id) && typeof row.invite_token === "string" && validToken(row.invite_token) && typeof row.expires_at === "string" && Number.isFinite(Date.parse(row.expires_at))));
    },
    accept(token: string): Promise<Result<string>> {
      if (!validToken(token.trim())) return Promise.resolve({ ok: false, error: "Enter the complete 64-character lowercase invitation code." });
      return call("accept_helper_invite", { invite_token: token.trim() }, uuid);
    },
    queue(familyId: string): Promise<Result<Approval[]>> {
      if (!uuid(familyId)) return Promise.resolve({ ok: false, error: "Your family account is not ready." });
      return call("list_helper_approval_queue", { target_family: familyId }, (data): data is Approval[] => Array.isArray(data) && data.every(row => record(row) && uuid(row.membership_id) && row.family_id === familyId && uuid(row.accepting_account_id) && typeof row.helper_name === "string" && typeof row.relationship === "string" && (typeof row.accepting_account_name === "string" || row.accepting_account_name === null) && typeof row.accepted_at === "string" && Number.isFinite(Date.parse(row.accepted_at))));
    },
    approve(helperId: string): Promise<Result<string>> {
      if (!uuid(helperId)) return Promise.resolve({ ok: false, error: "Invalid membership. Refresh the approval queue." });
      return call("approve_helper", { target_helper: helperId }, uuid);
    },
  };
}
