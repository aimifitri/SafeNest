import { useRouter } from "expo-router";
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { Card } from "../shared/Card";
import type { SetupTask, SetupTaskKey } from "../shared/setupTasks";
import { Btn, Press, T, useColors } from "../shared/ui";
import { useOnboarding } from "./OnboardingContext";
import { useSetup } from "./useSetup";

/** Where each setup task is done. Pages inside Settings open through the ?page= link. */
export function useSetupActions() {
  const router = useRouter();
  const onboarding = useOnboarding();
  return (key: SetupTaskKey) => {
    if (key === "plan") return router.push("/plan");
    if (key === "circle") return router.push("/circle");
    if (key === "availability") return router.push({ pathname: "/settings", params: { page: "availability" } });
    if (key === "child" || key === "family") return router.push({ pathname: "/settings", params: { page: "household" } });
    onboarding.show();
  };
}

/** Full checklist. Done steps are ticked, the first open step is the main action. Never shown in Demo Mode. */
export function SetupChecklist({ title = "Get set up" }: { title?: string }) {
  const c = useColors();
  const { tasks, next, done, total } = useSetup();
  const go = useSetupActions();
  const onboarding = useOnboarding();
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <T s={1.05} w={800}>{title}</T>
          <T s={0.84} w={600} c="muted">{done} of {total} done</T>
        </View>
        {tasks.map((t: SetupTask) => {
          const isNext = next?.key === t.key;
          return (
            <Press
              key={t.key}
              onPress={() => go(t.key)}
              label={`${t.title}${t.done ? ", done" : ""}`}
              hint={t.detail}
              scaleTo={0.985}
              style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 56, paddingVertical: 4 }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: t.done ? c.success : isNext ? c.primary : c.line, backgroundColor: t.done ? c.success : "transparent" }}>
                {t.done ? <Icon name="check" size={14} color={c.onPrimary} stroke={3} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={isNext ? 800 : 600} c={t.done ? "muted" : "ink"} lh={1.3}>{t.title}</T>
                {!t.done ? <T s={0.84} c="muted" lh={1.35}>{t.detail}</T> : null}
              </View>
              {!t.done ? <Icon name="chev" size={18} color={c.muted} stroke={2} /> : null}
            </Press>
          );
        })}
        <Btn kind="o" sm onPress={onboarding.show} label="Start guided setup">Start guided setup</Btn>
      </View>
    </Card>
  );
}

/** One line on Today once there is a child but setup is not finished. Hidden when everything is done and in Demo Mode. */
export function NextStepCard() {
  const { next, complete, done, total } = useSetup();
  const go = useSetupActions();
  if (complete || !next) return null;
  return (
    <Card>
      <View style={{ gap: 8 }}>
        <T s={0.78} w={700} ls={0.06} up c="muted">Finish setting up · {done} of {total}</T>
        <T w={800} lh={1.3}>{next.title}</T>
        <T s={0.88} c="muted" lh={1.4}>{next.detail}</T>
        <Btn kind="s" sm onPress={() => go(next.key)} label={next.title}>Do this now</Btn>
      </View>
    </Card>
  );
}
