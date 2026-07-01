"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { clearRoleSession, getCurrentRoleAccount } from "@/lib/auth";
import { clearTokens } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";

export function VenueProfile() {
  const router = useRouter();
  const currentAccount = getCurrentRoleAccount("venue-tablet");

  const handleLogout = () => {
    clearRoleSession("venue-tablet");
    clearTokens();
    router.replace("/venue/qr-scan");
  };

  if (!currentAccount) {
    return <EmptyState title="로그인 정보를 찾을 수 없습니다." description="다시 로그인한 뒤 이용해 주세요." />;
  }

  return (
    <article className="list-card">
      <strong>공연장 테블릿 계정</strong>
      <div className="list-card__meta">{currentAccount.email}</div>
      <p className="helper-text">비밀번호 변경은 관리자(Django admin)를 통해 처리됩니다.</p>
      <div className="button-row">
        <Button type="button" variant="secondary" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>
    </article>
  );
}
