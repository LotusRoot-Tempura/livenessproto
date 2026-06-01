"use client";

import { StatusCard } from "@/components/StatusCard";
import { useLocalData } from "@/hooks/useLocalData";
import { getDashboardStats } from "@/store/appStore";

const INITIAL_STATS = {
  users: 0,
  tickets: 0,
  successLogs: 0,
  reviewLogs: 0,
};

export function DashboardStats() {
  const { data: stats } = useLocalData(() => getDashboardStats(), [], INITIAL_STATS);

  return (
    <div className="stats-grid">
      <StatusCard title={`이용자 ${stats.users}명`} description="등록된 기본 사용자 수" tone="info" />
      <StatusCard title={`티켓 ${stats.tickets}건`} description="생성된 QR 티켓 수" tone="success" />
      <StatusCard title={`입장 ${stats.successLogs}건`} description="얼굴 인증 mock 통과 수" tone="success" />
      <StatusCard title={`수동 확인 ${stats.reviewLogs}건`} description="현장 관리자 확인 필요 수" tone="warning" />
    </div>
  );
}
