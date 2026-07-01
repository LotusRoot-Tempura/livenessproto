import type { AppRole } from "@/lib/constants";
import { localStore } from "@/lib/storage";
import type { User } from "@/types/models";

export const AUTH_STATE_EVENT = "gtf-auth-state-changed";

const SESSION_KEYS = {
  user: "gtf_session_user",
  "venue-tablet": "gtf_session_venue_tablet",
  "tablet-admin": "gtf_session_tablet_admin",
} as const satisfies Record<AppRole, string>;

// 테블릿 역할(공연장/관리자)은 이제 백엔드 시드 계정으로 로그인한다.
// 고정 계정 정보를 담는 read-only 표시용 타입.
export type RoleAccount = {
  email: string;
};

export type RoleSession = {
  email: string;
  loggedInAt: string;
  userId?: string;
  role?: AppRole;
};

function readSession(role: AppRole): RoleSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEYS[role]);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RoleSession;
  } catch {
    return null;
  }
}

function writeSession(role: AppRole, session: RoleSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEYS[role]);
    window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, { detail: { role, authenticated: false } }));
    return;
  }

  window.localStorage.setItem(SESSION_KEYS[role], JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT, { detail: { role, authenticated: true } }));
}

export function getRoleSession(role: AppRole) {
  return readSession(role);
}

export function setRoleSession(role: AppRole, session: RoleSession) {
  writeSession(role, session);
}

export function clearRoleSession(role: AppRole) {
  writeSession(role, null);
}

export function getUserAccounts() {
  return localStore.getUsers().filter((user) => Boolean(user.password));
}

export function findUserAccountByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return getUserAccounts().find((user) => user.email.trim().toLowerCase() === normalized) ?? null;
}

export function validateUserLogin(email: string, password: string): User | null {
  const account = findUserAccountByEmail(email);
  if (!account || account.password !== password) return null;
  return account;
}

export function getCurrentUserAccount(): User | null {
  const session = getRoleSession("user");
  if (!session?.userId) return null;
  return getUserAccounts().find((user) => user.id === session.userId && user.email === session.email) ?? null;
}

export function getCurrentRoleAccount(role: AppRole): RoleAccount | null {
  const session = getRoleSession(role);
  if (!session || session.role !== role) return null;
  return { email: session.email };
}

export function updateCurrentUserPassword(nextPassword: string): User | null {
  const session = getRoleSession("user");
  if (!session?.userId) return null;

  const users = localStore.getUsers();
  const currentUser = users.find((user) => user.id === session.userId && user.email === session.email);
  if (!currentUser) return null;

  const updatedUser = { ...currentUser, password: nextPassword };
  localStore.saveUsers(users.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
  return updatedUser;
}

export function isRoleAuthenticated(role: AppRole): boolean {
  const session = getRoleSession(role);
  if (!session) return false;

  if (role === "user") {
    return getUserAccounts().some((user) => user.id === session.userId && user.email === session.email);
  }

  // 테블릿 역할: 백엔드 로그인 시 저장한 세션 role 이 일치하면 인증됨
  return session.role === role;
}
