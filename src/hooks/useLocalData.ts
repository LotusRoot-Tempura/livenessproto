"use client";

import { useCallback, useEffect, useState } from "react";
import { STORAGE_STATE_EVENT } from "@/lib/storage";

export function useLocalData<T>(loader: () => T, deps: unknown[] = [], initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setData(loader());
  }, [loader]);

  useEffect(() => {
    setHydrated(true);
    refresh();

    const handleRefresh = () => {
      refresh();
    };

    window.addEventListener(STORAGE_STATE_EVENT, handleRefresh);
    window.addEventListener("storage", handleRefresh);

    return () => {
      window.removeEventListener(STORAGE_STATE_EVENT, handleRefresh);
      window.removeEventListener("storage", handleRefresh);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, refresh, setData, hydrated };
}
