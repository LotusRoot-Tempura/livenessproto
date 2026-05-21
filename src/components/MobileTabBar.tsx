"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_ITEMS } from "@/lib/constants";

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TAB_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} data-active={pathname === item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
