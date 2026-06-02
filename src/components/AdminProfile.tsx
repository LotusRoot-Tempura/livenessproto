"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { clearRoleSession, getCurrentRoleAccount, updateRolePassword } from "@/lib/auth";
import { EmptyState } from "@/components/EmptyState";

export function AdminProfile() {
  const router = useRouter();
  const currentAccount = getCurrentRoleAccount("tablet-admin");
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showNextPasswordConfirm, setShowNextPasswordConfirm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: "",
    nextPasswordConfirm: "",
  });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const handleLogout = () => {
    clearRoleSession("tablet-admin");
    router.replace("/admin/members");
  };

  const handlePasswordChange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordForm.nextPassword || !passwordForm.nextPasswordConfirm) {
      setMessage("새 비밀번호를 모두 입력해 주세요.");
      setMessageTone("error");
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.nextPasswordConfirm) {
      setMessage("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      setMessageTone("error");
      return;
    }

    updateRolePassword("tablet-admin", passwordForm.nextPassword);
    setPasswordForm({ nextPassword: "", nextPasswordConfirm: "" });
    setMessage("비밀번호가 변경되었습니다.");
    setMessageTone("success");
  };

  if (!currentAccount) {
    return <EmptyState title="로그인 정보를 찾을 수 없습니다." description="다시 로그인한 뒤 이용해 주세요." />;
  }

  return (
    <article className="list-card">
      <strong>테블릿 관리자 계정</strong>
      <div className="list-card__meta">{currentAccount.email}</div>
      <form className="panel panel--compact form-grid" onSubmit={handlePasswordChange}>
        <div className="field">
          <label htmlFor="admin-next-password">비밀번호 변경</label>
          <div className="password-field">
            <input
              id="admin-next-password"
              type={showNextPassword ? "text" : "password"}
              value={passwordForm.nextPassword}
              onChange={(event) => {
                setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }));
                setMessage("");
              }}
            />
            <Button type="button" variant="secondary" onClick={() => setShowNextPassword((current) => !current)}>
              {showNextPassword ? "숨기기" : "보기"}
            </Button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="admin-next-password-confirm">비밀번호 확인</label>
          <div className="password-field">
            <input
              id="admin-next-password-confirm"
              type={showNextPasswordConfirm ? "text" : "password"}
              value={passwordForm.nextPasswordConfirm}
              onChange={(event) => {
                setPasswordForm((current) => ({ ...current, nextPasswordConfirm: event.target.value }));
                setMessage("");
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNextPasswordConfirm((current) => !current)}
            >
              {showNextPasswordConfirm ? "숨기기" : "보기"}
            </Button>
          </div>
        </div>
        {message ? (
          <p className="helper-text" style={{ color: messageTone === "error" ? "var(--danger)" : "var(--success)" }}>
            {message}
          </p>
        ) : null}
        <Button type="submit">비밀번호 변경</Button>
      </form>
      <div className="button-row">
        <Button type="button" variant="secondary" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>
    </article>
  );
}
