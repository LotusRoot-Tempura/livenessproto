import Link from "next/link";
import type { NavItem } from "@/lib/constants";

export function RoleMenuGrid({
  items,
  simple = false,
}: {
  items: readonly NavItem[];
  simple?: boolean;
}) {
  return (
    <div className={`menu-grid${simple ? " menu-grid--simple" : ""}`}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="menu-card">
          <span className="menu-card__label">{item.label}</span>
          {simple ? null : <span className="menu-card__hint">{item.description}</span>}
        </Link>
      ))}
    </div>
  );
}
