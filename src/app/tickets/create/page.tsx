import { PageSection } from "@/components/PageSection";
import { TicketCreator } from "@/components/TicketCreator";

export default function TicketCreatePage() {
  return (
    <PageSection title="티켓 생성" description="구매자를 선택하고 공연 정보를 입력해 QR 티켓을 생성합니다.">
      <TicketCreator />
    </PageSection>
  );
}
