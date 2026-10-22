import { useAppContext } from "../shared/AppContext";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { nextTask, setupProgress, setupTasks, type SetupTask } from "../shared/setupTasks";
import { useHasAvailability } from "../shared/useAvailability";

/** What is still missing for this account. Demo Mode counts as complete: it is a finished sample. */
export function useSetup(): { tasks: SetupTask[]; next: SetupTask | null; done: number; total: number; complete: boolean } {
  const { profile, demo } = useAuth();
  const h = useHousehold();
  const { planConfigured } = useAppContext();
  const hasAvailability = useHasAvailability(h.version);
  const tasks = setupTasks({
    accountType: demo ? "parent" : profile?.accountType ?? null,
    hasChild: !!h.child,
    hasSchool: !!h.child?.schoolName,
    planConfigured,
    familyInvited: h.members.length > 1 || h.familyInvites.length > 0,
    helperCount: h.helpers.length,
    approvedHelperCount: h.helpers.filter((x) => x.state === "active").length,
    availabilitySet: hasAvailability,
  });
  const p = setupProgress(tasks);
  return { tasks, next: nextTask(tasks), done: p.done, total: p.total, complete: demo || p.done === p.total };
}
