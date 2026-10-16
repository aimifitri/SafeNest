import type { ReactNode } from "react";

import { Btn } from "./ui";

export type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; accessibilityLabel?: string; leadingIcon?: ReactNode };

export function PrimaryButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, leadingIcon }: ButtonProps) {
  return (
    <Btn kind="p" label={accessibilityLabel ?? label} onPress={onPress} disabled={disabled} loading={loading} leading={leadingIcon}>
      {label}
    </Btn>
  );
}
