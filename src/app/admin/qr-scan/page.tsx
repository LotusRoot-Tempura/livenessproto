import { PageSection } from "@/components/PageSection";
import { QrVerificationFlow } from "@/components/QrVerificationFlow";

export default function AdminQrScanPage() {
  return (
    <PageSection title="입장확인">
      <QrVerificationFlow />
    </PageSection>
  );
}
