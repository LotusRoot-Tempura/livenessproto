import type { ReactNode } from "react";
import { RoleAuthGate } from "@/components/RoleAuthGate";

export default function VenueLayout({ children }: { children: ReactNode }) {
  return <RoleAuthGate role="venue-tablet">{children}</RoleAuthGate>;
}
