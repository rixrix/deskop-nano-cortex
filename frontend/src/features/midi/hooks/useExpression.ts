/**
 * useExpression hook — debounces expression slider changes and fires CC1 via the MIDI connection.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-19]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useState, useCallback } from "react";

export function useExpression(send: (bytes: number[]) => Promise<void>, isConnected: boolean) {
  const [value, setValue] = useState(0);

  const change = useCallback(
    async (v: number) => {
      setValue(v);
      if (isConnected) {
        try {
          await send([0xb0, 1, v]);
        } catch {
          // ignore
        }
      }
    },
    [isConnected, send],
  );

  return { value, change, setLocalValue: setValue };
}
