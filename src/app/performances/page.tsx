import { PageSection } from "@/components/PageSection";
import { PerformanceRegistration } from "@/components/PerformanceRegistration";

export default function PerformancesPage() {
  return (
    <PageSection
      title="공연 등록"
      description="공연명, 공연일, 좌석수, 가수명을 등록하고 티켓 생성에서 선택할 수 있습니다."
    >
      <PerformanceRegistration />
    </PageSection>
  );
}
