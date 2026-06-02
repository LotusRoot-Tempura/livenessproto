import { PageSection } from "@/components/PageSection";
import { RoleMenuGrid } from "@/components/RoleMenuGrid";
import { ROLE_ITEMS } from "@/lib/constants";

export default function HomePage() {
  return (
    <PageSection>
      <RoleMenuGrid items={ROLE_ITEMS} simple />
    </PageSection>
  );
}
