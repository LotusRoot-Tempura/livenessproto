import type { ReactNode } from "react";
import { RoleAuthGate } from "@/components/RoleAuthGate";

export default function UserLayout({ children }: { children: ReactNode }) {
  return <RoleAuthGate role="user">{children}</RoleAuthGate>;
}
