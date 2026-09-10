"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Trava envio duplicado (duplo clique / Enter 2x).
 * useRef cobre o intervalo antes do re-render; `busy` desabilita o botão.
 */
export function useSubmitLock() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
