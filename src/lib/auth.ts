import type { AppRole } from "@/lib/constants";
import { localStore } from "@/lib/storage";
import type { User } from "@/types/models";

export const AUTH_STATE_EVENT = "gtf-auth-state-changed";

const SESSION_KEYS = {
  user: "gtf_session_user",
  "venue-tablet": "gtf_session_venue_tablet",
  "tablet-admin": "gtf_session_tablet_admin",
} as const satisfies Record<AppRole, string>;

const ROLE_CREDENTIAL_KEYS = {
  "venue-tablet": "gtf_credential_venue_tablet",
  "tablet-admin": "gtf_credential_tablet_admin",
} as const;

const DEFAULT_ROLE_CREDENTIALS = {
  "venue-tablet": {
    email: "grabtick@mail.com",
    password: "zcbm13579!",
  },
  "tablet-admin": {
    email: "grabtick@mail.com",
    password: "zcbm13579!",
  },
} as const;

export type FixedRole = keyof typeof DEFAULT_ROLE_CREDENTIALS;
export type RoleCredential = {
  email: string;
  password: string;
};

export type RoleSession = {
  email: string;
  loggedInAt: string;
  userId?: string;
};

function readRoleCredential(role: FixedRole): RoleCredential {
  if (typeof window === "undefined") return DEFAULT_ROLE_CREDENTIALS[role];
  const raw = window.localStorage.getItem(ROLE_CREDENTIAL_KEYS[role]);
  if (!raw) return DEFAULT_ROLE_CREDENTIALS[role];

  try {
    return JSON.parse(raw) as RoleCredential;
  } catch {
    return DEFAULT_ROLE_CREDENTIALS[role];
  }
}

function writeRoleCredential(role: FixedRole, credential: RoleCredential) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLE_CREDENTIAL_KEYS[role], JSON.stringify(credential));
}

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

export function getRoleCredential(role: FixedRole): RoleCredential {
  return readRoleCredential(role);
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

export function getCurrentRoleAccount(role: FixedRole): RoleCredential | null {
  const session = getRoleSession(role);
  if (!session) return null;

  const credential = getRoleCredential(role);
  if (credential.email !== session.email) return null;
  return credential;
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

export function updateRolePassword(role: FixedRole, nextPassword: string): RoleCredential {
  const current = getRoleCredential(role);
  const updated = { ...current, password: nextPassword };
  writeRoleCredential(role, updated);
  return updated;
}

export function isRoleAuthenticated(role: AppRole): boolean {
  const session = getRoleSession(role);
  if (!session) return false;

  if (role === "user") {
    return getUserAccounts().some((user) => user.id === session.userId && user.email === session.email);
  }

  const fixed = getRoleCredential(role);
  return Boolean(fixed && session.email === fixed.email);
}
