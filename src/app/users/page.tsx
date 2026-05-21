import { PageSection } from "@/components/PageSection";
import { UserRegistration } from "@/components/UserRegistration";

export default function UsersPage() {
  return (
    <PageSection title="이용자 등록" description="입장 대상자의 기본 정보를 등록하고 로컬 저장소에 보관합니다.">
      <UserRegistration />
    </PageSection>
  );
}
