import Link from "next/link";
import { PageSection } from "@/components/PageSection";
import { StatusCard } from "@/components/StatusCard";
import { MENU_ITEMS } from "@/lib/constants";
import { DashboardStats } from "@/components/DashboardStats";

export default function HomePage() {
  return (
    <PageSection
      title="현장 입장 운영 홈"
      description="등록은 꼼꼼하게, 현장 인증은 빠르게 처리하는 로컬 MVP 대시보드입니다."
    >
      <DashboardStats />
      <div className="grid-cards">
        <StatusCard
          title="운영 원칙"
          tone="info"
          description="QR 확인, 권한 검증 mock, 얼굴 확인 mock 순서로 입장 흐름을 통제합니다."
        />
        <StatusCard
          title="저장 방식"
          tone="neutral"
          description="이용자, 티켓, 로그는 localStorage, 영상과 캡처 이미지는 IndexedDB에 저장합니다."
        />
      </div>
      <div className="menu-grid">
        {MENU_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="menu-card">
            <span className="menu-card__label">{item.label}</span>
            <span className="menu-card__hint">{item.description}</span>
          </Link>
        ))}
      </div>
    </PageSection>
  );
}
