"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { clearRoleSession, getCurrentUserAccount, updateCurrentUserPassword } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

export function UserProfile() {
  const router = useRouter();
  const currentUser = getCurrentUserAccount();
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showNextPasswordConfirm, setShowNextPasswordConfirm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: "",
    nextPasswordConfirm: "",
  });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");

  const handleLogout = () => {
    clearRoleSession("user");
    router.replace("/user/face-register");
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

    const updated = updateCurrentUserPassword(passwordForm.nextPassword);
    if (!updated) {
      setMessage("비밀번호를 변경하지 못했습니다. 다시 로그인해 주세요.");
      setMessageTone("error");
      return;
    }

    setPasswordForm({ nextPassword: "", nextPasswordConfirm: "" });
    setMessage("비밀번호가 변경되었습니다.");
    setMessageTone("success");
  };

  if (!currentUser) {
    return <EmptyState title="회원 정보를 찾을 수 없습니다." description="다시 로그인한 뒤 이용해 주세요." />;
  }

  return (
    <article className="list-card">
      <strong>{currentUser.name}</strong>
      <div className="list-card__meta">{currentUser.email}</div>
      <div className="list-card__meta">{currentUser.phone}</div>
      <div className="list-card__meta">회원 ID: {currentUser.id}</div>
      <div className="list-card__meta">가입일: {formatDateTime(currentUser.createdAt)}</div>
      <form className="panel panel--compact form-grid" onSubmit={handlePasswordChange}>
        <div className="field">
          <label htmlFor="profile-next-password">비밀번호 변경</label>
          <div className="password-field">
            <input
              id="profile-next-password"
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
          <label htmlFor="profile-next-password-confirm">비밀번호 확인</label>
          <div className="password-field">
            <input
              id="profile-next-password-confirm"
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
