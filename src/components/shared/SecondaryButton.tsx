import type { ReactNode } from "react";

import { Btn } from "./ui";
import type { ButtonProps } from "./PrimaryButton";

type SecondaryButtonProps = ButtonProps & { leadingIcon?: ReactNode };

export function SecondaryButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, leadingIcon }: SecondaryButtonProps) {
  return (
    <Btn kind="s" label={accessibilityLabel ?? label} onPress={onPress} disabled={disabled} loading={loading} leading={leadingIcon}>
      {label}
    </Btn>
  );
}
