import { PageSection } from "@/components/PageSection";
import { TicketCreator } from "@/components/TicketCreator";

export default function TicketCreatePage() {
  return (
    <PageSection title="티켓 생성" description="등록된 공연을 선택하고 구매자를 지정해 QR 티켓을 생성합니다.">
      <TicketCreator />
    </PageSection>
  );
}
