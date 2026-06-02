import type { ReactNode } from "react";
import { RoleAuthGate } from "@/components/RoleAuthGate";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleAuthGate role="tablet-admin">{children}</RoleAuthGate>;
}
