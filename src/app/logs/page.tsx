import { PageSection } from "@/components/PageSection";
import { EntryLogList } from "@/components/EntryLogList";

export default function LogsPage() {
  return (
    <PageSection title="입장 로그" description="입장 승인, 관리자 확인, 거부 내역을 시간순으로 확인합니다.">
      <EntryLogList />
    </PageSection>
  );
}
