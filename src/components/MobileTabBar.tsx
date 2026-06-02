"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMenuItemsByRole, getRoleByPathname } from "@/lib/constants";
import { AUTH_STATE_EVENT, isRoleAuthenticated } from "@/lib/auth";

export function MobileTabBar() {
  const pathname = usePathname();
  const role = getRoleByPathname(pathname);
  const tabItems = getMenuItemsByRole(role);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!role) {
      setVisible(false);
      return;
    }

    const syncVisibility = () => {
      setVisible(isRoleAuthenticated(role));
    };

    syncVisibility();
    window.addEventListener(AUTH_STATE_EVENT, syncVisibility);
    window.addEventListener("storage", syncVisibility);

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, syncVisibility);
      window.removeEventListener("storage", syncVisibility);
    };
  }, [role]);

  if (tabItems.length === 0 || !visible) {
    return null;
  }

  return (
    <nav className="tabbar">
      {tabItems.map((item) => (
        <Link key={item.href} href={item.href} data-active={pathname === item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
