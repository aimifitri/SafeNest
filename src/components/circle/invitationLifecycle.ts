// No secrets are stored here. Epochs prevent delayed results crossing privacy boundaries.
export function createInvitationLifecycle() {
  let epoch = 0;
  let mounted = false;
  let active = false;
  return {
    mount(state: string | null) { epoch++; mounted = true; active = state === "active"; },
    change(state: string) { if (state !== "active") epoch++; active = state === "active"; },
    dispose() { epoch++; mounted = false; active = false; },
    ticket() { return epoch; },
    isCurrent(ticket: number) { return mounted && active && ticket === epoch; },
  };
}
