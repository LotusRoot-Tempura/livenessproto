"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalData<T>(loader: () => T, deps: unknown[] = [], initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setData(loader());
  }, [loader]);

  useEffect(() => {
    setHydrated(true);
    refresh();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, refresh, setData, hydrated };
}
