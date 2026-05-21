import { PageSection } from "@/components/PageSection";
import { TicketList } from "@/components/TicketList";

export default function TicketsPage() {
  return (
    <PageSection title="티켓 목록" description="구매자와 입장자를 구분해 보고, 허용 시간 내에서 입장자를 변경합니다.">
      <TicketList />
    </PageSection>
  );
}
