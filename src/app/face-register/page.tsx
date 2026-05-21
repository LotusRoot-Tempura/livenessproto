import { PageSection } from "@/components/PageSection";
import { FaceRegistrationFlow } from "@/components/FaceRegistrationFlow";

export default function FaceRegisterPage() {
  return (
    <PageSection
      title="얼굴 영상 등록"
      description="촬영 가이드를 확인하고 등록 영상을 촬영해 IndexedDB에 저장합니다."
    >
      <FaceRegistrationFlow />
    </PageSection>
  );
}
