"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_VERSION } from "@/lib/appVersion";
import { clearTokens } from "@/lib/api";
import { AUTH_STATE_EVENT, clearRoleSession, getRoleSession, type RoleSession } from "@/lib/auth";
import { getRoleByPathname, getRoleLabel, type AppRole } from "@/lib/constants";

// 로그아웃 후 이동할 역할별 첫 화면 (프로필 화면의 로그아웃 동작과 동일)
const ROLE_HOME: Record<AppRole, string> = {
  user: "/user/face-register",
  "venue-tablet": "/venue/qr-scan",
  "tablet-admin": "/admin/members",
};

export function TopbarStatus() {
  const pathname = usePathname();
  const router = useRouter();
  const role = getRoleByPathname(pathname);
  const label = getRoleLabel(role);
  const [session, setSession] = useState<RoleSession | null>(null);

  // 로그인/로그아웃(AUTH_STATE_EVENT)과 경로 변경에 맞춰 현재 역할의 세션을 동기화
  useEffect(() => {
    const sync = () => setSession(role ? getRoleSession(role) : null);
    sync();

    window.addEventListener(AUTH_STATE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [role]);

  const handleLogout = () => {
    if (!role) return;
    clearRoleSession(role);
    // JWT는 이용자 API(얼굴등록/주문)에서만 사용 — 이용자 로그아웃 시 폐기
    if (role === "user") clearTokens();
    router.replace(ROLE_HOME[role]);
  };

  return (
    <div className="topbar-status-wrap">
      <div className="topbar-status">
        <div className="topbar-status__role" aria-label={`현재 모드 ${label}`}>
          <span className="topbar-status__caption">현재 모드</span>
          <strong>{label}</strong>
        </div>
        <div className="topbar-status__actions">
          <span className="topbar-status__version">v{APP_VERSION}</span>
          <Link href="/" className="topbar-status__home">
            Home
          </Link>
        </div>
      </div>
      {session ? (
        <div className="topbar-account" aria-label="로그인 계정 정보">
          <span className="topbar-account__item">
            <span className="topbar-account__caption">로그인</span> {session.email}
          </span>
          <span className="topbar-account__item">
            <span className="topbar-account__caption">role</span>{" "}
            <code className="topbar-account__code">{session.role ?? "-"}</code>
          </span>
          <span className="topbar-account__item">
            <span className="topbar-account__caption">id</span>{" "}
            <code className="topbar-account__code">{session.userId ?? "-"}</code>
          </span>
          <button type="button" className="topbar-account__logout" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}
