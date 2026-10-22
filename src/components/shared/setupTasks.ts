// Pure: what is still missing for an account to be useful, in the order a parent should do it.
// Drives the empty states on Today and Circle and decides whether first-time onboarding opens by itself.

export type SetupInput = {
  accountType: "parent" | "helper" | null;
  hasChild: boolean;
  hasSchool: boolean;
  planConfigured: boolean;
  familyInvited: boolean;
  helperCount: number;
  approvedHelperCount: number;
  availabilitySet: boolean;
};

export type SetupTaskKey = "child" | "plan" | "family" | "circle" | "availability";
export type SetupTask = { key: SetupTaskKey; title: string; detail: string; done: boolean };

export function setupTasks(i: SetupInput): SetupTask[] {
  if (i.accountType === "helper") {
    return [{ key: "availability", title: "Set your pickup availability", detail: "Tell SafeNest when you can be asked to help.", done: i.availabilitySet }];
  }
  return [
    { key: "child", title: "Add your first child", detail: "Their name and school are needed to plan a pickup.", done: i.hasChild && i.hasSchool },
    { key: "plan", title: "Complete your pickup plan", detail: "Set the usual school finish time for each weekday.", done: i.planConfigured },
    { key: "family", title: "Invite a family member", detail: "Optional. Another parent or guardian can share the household.", done: i.familyInvited },
    { key: "circle", title: "Set up your Trusted Circle", detail: "Add and approve the people who may collect your child.", done: i.approvedHelperCount > 0 },
    { key: "availability", title: "Set your pickup availability", detail: "Tell SafeNest when you can be asked to help.", done: i.availabilitySet },
  ];
}

export function nextTask(tasks: SetupTask[]): SetupTask | null {
  return tasks.find((t) => !t.done && t.key !== "family") ?? null;
}

export function setupProgress(tasks: SetupTask[]): { done: number; total: number } {
  const required = tasks.filter((t) => t.key !== "family");
  return { done: required.filter((t) => t.done).length, total: required.length };
}

/** First-time onboarding opens by itself once per account, and only for an account with nothing set up. */
export function shouldAutoOpenOnboarding(i: { real: boolean; ready: boolean; stored: "none" | "done" | "skipped"; hasChild: boolean; helperCount: number; accountType: "parent" | "helper" | null }): boolean {
  if (!i.real || !i.ready || i.stored !== "none") return false;
  if (i.accountType === "helper") return true;
  return !i.hasChild && i.helperCount === 0;
}
