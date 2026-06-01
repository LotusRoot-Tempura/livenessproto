"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isDev =
      process.env.NODE_ENV !== "production" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isDev) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister().catch(() => undefined);
        });
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.delete(key).catch(() => undefined);
          });
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure should not block the app.
    });
  }, []);

  return null;
}
