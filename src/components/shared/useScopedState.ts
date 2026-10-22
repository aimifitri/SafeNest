import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

// The setter captures its scope: late asynchronous results can only update their original child.
export function useScopedState<T>(scope: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [values, setValues] = useState<Record<string, T>>({});
  const read = (current: Record<string, T>) => Object.prototype.hasOwnProperty.call(current, scope) ? current[scope] : initial;
  const set = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setValues(current => ({
      ...current,
      [scope]: typeof next === "function" ? (next as (old: T) => T)(read(current)) : next,
    }));
  }, [scope, initial]);
  return [read(values), set];
}
