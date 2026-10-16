import { Chip, Pill, useTone } from "./ui";

type StatusPillProps = { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" };

// Inside a hero/warning card the status shows as the prototype's pulsing-dot pill;
// elsewhere it is a compact chip coloured by tone.
export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const cardTone = useTone();
  if (cardTone !== "default") return <Pill>{label}</Pill>;
  const kind = tone === "success" ? "ok" : tone === "warning" ? "gold" : tone === "danger" ? "no" : "yes";
  return <Chip kind={kind}>{label}</Chip>;
}
