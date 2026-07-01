"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { PageSection } from "@/components/PageSection";
import {
  AUTH_STATE_EVENT,
  getRoleSession,
  getUserAccounts,
  setRoleSession,
} from "@/lib/auth";
import { ApiError, apiLogin, apiSignup, saveTokens } from "@/lib/api";
import { localStore } from "@/lib/storage";
import type { AppRole } from "@/lib/constants";
import type { User } from "@/types/models";

// 백엔드에서 인증된 이용자를 로컬 저장소에도 반영(미러링)해 기존 localStorage 흐름과 호환시킨다.
function upsertLocalUser(user: User) {
  const others = localStore.getUsers().filter((u) => u.id !== user.id && u.email !== user.email);
  localStore.saveUsers([user, ...others]);
}

type AuthStatus = "checking" | "locked" | "authenticated";

const ROLE_LOGIN_TITLES: Record<AppRole, string> = {
  user: "이용자 로그인",
  "venue-tablet": "공연장 테블릿 로그인",
  "tablet-admin": "테블릿 관리자 로그인",
};

const ROLE_SIGNUP_TITLES: Record<AppRole, string> = {
  user: "이용자 회원가입",
  "venue-tablet": "공연장 테블릿 로그인",
  "tablet-admin": "테블릿 관리자 로그인",
};

export function RoleAuthGate({ role, children }: { role: AppRole; children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userAuthMode, setUserAuthMode] = useState<"login" | "signup">("login");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupPasswordConfirm, setShowSignupPasswordConfirm] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signupForm, setSignupForm] = useState({
    email: "",
    name: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const hasUserAccounts = useMemo(() => getUserAccounts().length > 0, [status]);
  const showUserSignup = role === "user" && (!hasUserAccounts || userAuthMode === "signup");

  useEffect(() => {
    const syncAuthStatus = () => {
      const session = getRoleSession(role);

      if (role === "user") {
        const accounts = getUserAccounts();
        const hasAccounts = accounts.length > 0;
        if (!session) {
          setStatus("locked");
          setUserAuthMode(hasAccounts ? "login" : "signup");
          return;
        }

        const matched = accounts.find((user) => user.id === session.userId && user.email === session.email);
        setStatus(matched ? "authenticated" : hasAccounts ? "locked" : "locked");
        return;
      }

      // 테블릿 역할: 백엔드 로그인 시 저장한 세션 role 이 일치해야 인증
      const valid = Boolean(session && session.role === role);
      setStatus(valid ? "authenticated" : "locked");
    };

    syncAuthStatus();
    window.addEventListener(AUTH_STATE_EVENT, syncAuthStatus);
    window.addEventListener("storage", syncAuthStatus);

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, syncAuthStatus);
      window.removeEventListener("storage", syncAuthStatus);
    };
  }, [role]);

  const handleUserSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { email, name, phone, password, passwordConfirm } = signupForm;
    if (!email || !name || !phone || !password) return;
    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      // 백엔드에 회원가입 → 곧바로 로그인하여 JWT 토큰 발급
      await apiSignup({ email, name, phone, password });
      const { user, tokens } = await apiLogin({ email, password });
      saveTokens(tokens);
      upsertLocalUser(user);
      setRoleSession("user", {
        email: user.email,
        userId: user.id,
        role: "user",
        loggedInAt: new Date().toISOString(),
      });
      setUserAuthMode("login");
      setStatus("authenticated");
      setErrorMessage("");
      router.replace("/user/face-register");
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUserLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { user, tokens } = await apiLogin({
        email: loginForm.email,
        password: loginForm.password,
      });
      saveTokens(tokens);
      upsertLocalUser(user);
      setRoleSession("user", {
        email: user.email,
        userId: user.id,
        role: "user",
        loggedInAt: new Date().toISOString(),
      });
      setUserAuthMode("login");
      setStatus("authenticated");
      setErrorMessage("");
      router.replace("/user/face-register");
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "이메일 또는 비밀번호를 다시 확인해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFixedLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { user, tokens } = await apiLogin({
        email: loginForm.email,
        password: loginForm.password,
      });
      // 로그인한 계정의 권한이 이 화면의 역할과 일치하는지 검증
      if (user.role !== role) {
        setErrorMessage("이 계정은 해당 권한으로 로그인할 수 없습니다.");
        return;
      }

      saveTokens(tokens);
      setRoleSession(role, {
        email: user.email,
        userId: user.id,
        role,
        loggedInAt: new Date().toISOString(),
      });
      setStatus("authenticated");
      setErrorMessage("");
      router.replace(role === "venue-tablet" ? "/venue/qr-scan" : "/admin/members");
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "이메일 또는 비밀번호를 다시 확인해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return null;
  }

  if (status === "authenticated") {
    return <>{children}</>;
  }

  if (showUserSignup) {
    return (
      <PageSection title={ROLE_SIGNUP_TITLES[role]}>
        <form className="panel form-grid" onSubmit={handleUserSignup}>
          <div className="field">
            <label htmlFor={`${role}-signup-email`}>이메일</label>
            <input
              id={`${role}-signup-email`}
              type="email"
              value={signupForm.email}
              onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${role}-signup-name`}>이름</label>
            <input
              id={`${role}-signup-name`}
              value={signupForm.name}
              onChange={(event) => setSignupForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${role}-signup-phone`}>전화번호</label>
            <input
              id={`${role}-signup-phone`}
              value={signupForm.phone}
              onChange={(event) => setSignupForm((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${role}-signup-password`}>비밀번호</label>
            <div className="password-field">
              <input
                id={`${role}-signup-password`}
                type={showSignupPassword ? "text" : "password"}
                value={signupForm.password}
                onChange={(event) => {
                  setSignupForm((current) => ({ ...current, password: event.target.value }));
                  setErrorMessage("");
                }}
              />
              <Button type="button" variant="secondary" onClick={() => setShowSignupPassword((current) => !current)}>
                {showSignupPassword ? "숨기기" : "보기"}
              </Button>
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${role}-signup-password-confirm`}>비밀번호 확인</label>
            <div className="password-field">
              <input
                id={`${role}-signup-password-confirm`}
                type={showSignupPasswordConfirm ? "text" : "password"}
                value={signupForm.passwordConfirm}
                onChange={(event) => {
                  setSignupForm((current) => ({ ...current, passwordConfirm: event.target.value }));
                  setErrorMessage("");
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowSignupPasswordConfirm((current) => !current)}
              >
                {showSignupPasswordConfirm ? "숨기기" : "보기"}
              </Button>
            </div>
          </div>
          {errorMessage ? <p className="helper-text">{errorMessage}</p> : null}
          <Button type="submit" disabled={submitting}>{submitting ? "처리 중…" : "회원가입"}</Button>
          {hasUserAccounts ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setUserAuthMode("login");
                setErrorMessage("");
              }}
            >
              로그인으로 돌아가기
            </Button>
          ) : null}
        </form>
      </PageSection>
    );
  }

  return (
    <PageSection title={ROLE_LOGIN_TITLES[role]}>
      <form className="panel form-grid" onSubmit={role === "user" ? handleUserLogin : handleFixedLogin}>
        <div className="field">
          <label htmlFor={`${role}-login-email`}>이메일</label>
          <input
            id={`${role}-login-email`}
            type="email"
            value={loginForm.email}
            onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={`${role}-login-password`}>비밀번호</label>
          <div className="password-field">
            <input
              id={`${role}-login-password`}
              type={showLoginPassword ? "text" : "password"}
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
            />
            <Button type="button" variant="secondary" onClick={() => setShowLoginPassword((current) => !current)}>
              {showLoginPassword ? "숨기기" : "보기"}
            </Button>
          </div>
        </div>
        {errorMessage ? <p className="helper-text">{errorMessage}</p> : null}
        <Button type="submit" disabled={submitting}>{submitting ? "처리 중…" : "로그인"}</Button>
        {role === "user" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setUserAuthMode("signup");
              setErrorMessage("");
            }}
          >
            회원가입
          </Button>
        ) : null}
      </form>
    </PageSection>
  );
}
