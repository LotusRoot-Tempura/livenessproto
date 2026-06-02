"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { PageSection } from "@/components/PageSection";
import {
  AUTH_STATE_EVENT,
  getRoleCredential,
  getRoleSession,
  getUserAccounts,
  setRoleSession,
  validateUserLogin,
} from "@/lib/auth";
import { createUser } from "@/lib/mock";
import type { AppRole } from "@/lib/constants";

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

      const fixed = getRoleCredential(role);
      const valid = Boolean(session && session.email === fixed.email);
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

  const handleUserSignup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { email, name, phone, password, passwordConfirm } = signupForm;
    if (!email || !name || !phone || !password) return;
    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    const created = createUser({ email, name, phone, password });
    setRoleSession("user", {
      email: created.email,
      userId: created.id,
      loggedInAt: new Date().toISOString(),
    });
    setUserAuthMode("login");
    setStatus("authenticated");
    setErrorMessage("");
    router.replace("/user/face-register");
  };

  const handleUserLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matched = validateUserLogin(loginForm.email, loginForm.password);
    if (!matched) {
      setErrorMessage("이메일 또는 비밀번호를 다시 확인해 주세요.");
      return;
    }

    setRoleSession("user", {
      email: matched.email,
      userId: matched.id,
      loggedInAt: new Date().toISOString(),
    });
    setUserAuthMode("login");
    setStatus("authenticated");
    setErrorMessage("");
    router.replace("/user/face-register");
  };

  const handleFixedLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fixed = getRoleCredential(role as "venue-tablet" | "tablet-admin");
    if (!fixed || loginForm.email !== fixed.email || loginForm.password !== fixed.password) {
      setErrorMessage("이메일 또는 비밀번호를 다시 확인해 주세요.");
      return;
    }

    setRoleSession(role, {
      email: loginForm.email,
      loggedInAt: new Date().toISOString(),
    });
    setStatus("authenticated");
    setErrorMessage("");
    router.replace(role === "venue-tablet" ? "/venue/qr-scan" : "/admin/members");
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
          <Button type="submit">회원가입</Button>
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
        <Button type="submit">로그인</Button>
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
