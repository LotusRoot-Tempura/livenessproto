import { PageSection } from "@/components/PageSection";
import { QrVerificationFlow } from "@/components/QrVerificationFlow";

export default function VerifyPage() {
  return (
    <PageSection title="QR 인증" description="QR 스캔 후 mock ZK 검증과 얼굴 인증 mock을 순서대로 진행합니다.">
      <QrVerificationFlow />
    </PageSection>
  );
}
