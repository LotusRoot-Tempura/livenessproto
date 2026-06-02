"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_VERSION } from "@/lib/appVersion";
import { getRoleByPathname, getRoleLabel } from "@/lib/constants";

export function TopbarStatus() {
  const pathname = usePathname();
  const role = getRoleByPathname(pathname);
  const label = getRoleLabel(role);

  return (
    <div className="topbar-status">
      <div className="topbar-status__role" aria-label={`현재 모드 ${label}`}>
        <span className="topbar-status__caption">현재 모드</span>
        <strong>{label}</strong>
      </div>
      <div className="topbar-status__actions">
        <span className="topbar-status__version">v{APP_VERSION}</span>
        <Link href="/" className="topbar-status__home">
          Home
        </Link>
      </div>
    </div>
  );
}
