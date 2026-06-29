// 백엔드(Grab Ticket Django API) 연동 클라이언트.
// MVP 단계에서는 "이용자 회원가입/로그인"만 백엔드를 통해 처리하고(JWT 발급),
// 나머지 기능은 기존 localStorage 흐름을 유지한다.

import type { Performance, Ticket, User } from "@/types/models";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

// 키오스크(공연장 테블릿) 인증 키. 백엔드 settings.KIOSK_API_KEY 와 일치해야 한다.
export const KIOSK_API_KEY = process.env.NEXT_PUBLIC_KIOSK_API_KEY ?? "dev-kiosk-key";

const TOKEN_KEYS = {
  access: "gtf_access_token",
  refresh: "gtf_refresh_token",
} as const;

export type AuthTokens = { access: string; refresh: string };

// 백엔드 User 응답 (snake_case) → 프론트 User (camelCase) 매핑
type ApiUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  has_face: boolean;
  created_at: string;
};

function mapUser(api: ApiUser, password?: string): User {
  return {
    id: api.id,
    name: api.name,
    email: api.email,
    phone: api.phone,
    password,
    createdAt: api.created_at,
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// DRF 에러 응답({field: [msg]} 또는 {error: msg})에서 사람이 읽을 메시지 추출
function extractError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const obj = body as Record<string, unknown>;
  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.detail === "string") return obj.detail;
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return fallback;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // FormData 본문은 브라우저가 multipart 경계를 직접 설정하도록 Content-Type 을 비운다.
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("백엔드 서버에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.", 0);
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(extractError(body, "요청을 처리하지 못했습니다."), res.status);
  }
  return body as T;
}

// ── 토큰 저장/조회 ───────────────────────────────────────────────
export function saveTokens(tokens: AuthTokens) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEYS.access, tokens.access);
  window.localStorage.setItem(TOKEN_KEYS.refresh, tokens.refresh);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEYS.access);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEYS.access);
  window.localStorage.removeItem(TOKEN_KEYS.refresh);
}

// ── 이용자 인증 API ──────────────────────────────────────────────
export async function apiSignup(payload: {
  email: string;
  name: string;
  phone: string;
  password: string;
}): Promise<User> {
  const api = await request<ApiUser>("/api/v1/users/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapUser(api, payload.password);
}

export async function apiLogin(payload: {
  email: string;
  password: string;
}): Promise<{ user: User; tokens: AuthTokens }> {
  const data = await request<{ access: string; refresh: string; user: ApiUser }>(
    "/api/v1/users/login/",
    { method: "POST", body: JSON.stringify({ email: payload.email, password: payload.password }) },
  );
  return {
    user: mapUser(data.user, payload.password),
    tokens: { access: data.access, refresh: data.refresh },
  };
}

export async function apiMe(): Promise<User> {
  const api = await request<ApiUser>("/api/v1/users/me/", { headers: authHeaders() });
  return mapUser(api);
}

// ── 얼굴 등록 API ────────────────────────────────────────────────
export type FaceRegisterResult = {
  updated: boolean;
  det_score: number;
  frames_received: number;
  frames_valid: number;
  frames_real: number;
  message: string;
};

export async function apiRegisterFace(blobs: Blob[]): Promise<FaceRegisterResult> {
  const form = new FormData();
  blobs.forEach((blob, index) => form.append("images", blob, `face_${index}.jpg`));
  return request<FaceRegisterResult>("/api/v1/face/register/", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
}

// ── 공연 / 티켓 API ──────────────────────────────────────────────
type ApiPerformance = {
  id: string;
  event_name: string;
  artist_name: string;
  event_date: string;
  round_label: string;
  share_code: string;
  seat_count: number;
  remaining_seats: number;
  status: string;
  created_at: string;
};

type ApiTicket = {
  id: string;
  performance: { id: string; event_name: string; event_date: string };
  buyer: { id: string };
  holder: { id: string };
  seat_no: string;
  qr_hash: string | null;
  status: string;
  created_at: string;
};

// 입장 QR에 인코딩될 해시(프론트 생성). 추측 불가하도록 128비트 랜덤 hex.
export function generateQrHash(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function mapPerformance(api: ApiPerformance): Performance {
  return {
    id: api.id,
    eventName: api.event_name,
    artistName: api.artist_name,
    eventDate: api.event_date,
    roundLabel: api.round_label,
    shareCode: api.share_code,
    seatCount: api.seat_count,
    status: api.status as Performance["status"],
    createdAt: api.created_at,
  };
}

function mapTicket(api: ApiTicket): Ticket {
  return {
    id: api.id,
    performanceId: api.performance.id,
    eventName: api.performance.event_name,
    eventDate: api.performance.event_date,
    seatNo: api.seat_no,
    buyerId: api.buyer.id,
    holderUserId: api.holder.id,
    qrHash: api.qr_hash ?? undefined,
    status: api.status as Ticket["status"],
    createdAt: api.created_at,
  };
}

export async function apiListPerformances(): Promise<Performance[]> {
  const data = await request<ApiPerformance[]>("/api/v1/performances/");
  return data.map(mapPerformance);
}

export async function apiOrderTickets(
  performanceId: string,
  quantity: number,
  qrHashes?: string[],
): Promise<Ticket[]> {
  const data = await request<{ count: number; tickets: { ticket: ApiTicket }[] }>(
    "/api/v1/tickets/order/",
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        performance_id: performanceId,
        quantity,
        ...(qrHashes ? { qr_hashes: qrHashes } : {}),
      }),
    },
  );
  return data.tickets.map((item) => mapTicket(item.ticket));
}

// ── 입장(키오스크) QR 확인 API ──────────────────────────────────
export type QrCheckResult = {
  matched: boolean;
  valid: boolean;
  ticket_id?: string;
  status?: string;
  ticket?: Ticket;
};

export async function apiCheckQr(
  qrHash: string,
  kioskApiKey: string = KIOSK_API_KEY,
): Promise<QrCheckResult> {
  const raw = await request<{
    matched: boolean;
    valid: boolean;
    ticket_id?: string;
    status?: string;
    ticket?: ApiTicket;
  }>("/api/v1/tickets/qrcode/", {
    method: "POST",
    headers: { "X-Kiosk-Api-Key": kioskApiKey },
    body: JSON.stringify({ qr_hash: qrHash }),
  });
  return {
    matched: raw.matched,
    valid: raw.valid,
    ticket_id: raw.ticket_id,
    status: raw.status,
    ticket: raw.ticket ? mapTicket(raw.ticket) : undefined,
  };
}

export type FaceVerifyVerdict = "allowed" | "manual_review" | "denied" | "spoof";

export type FaceVerifyResult = {
  verified: boolean;
  similarity?: number; // 코사인 유사도 0~1
  threshold?: number;
  verdict: FaceVerifyVerdict;
  liveness?: { isReal: boolean; score: number };
  entryLogId?: string;
  ticket?: Ticket;
};

export async function apiVerifyFace(
  ticketId: string,
  image: Blob,
  kioskApiKey: string = KIOSK_API_KEY,
): Promise<FaceVerifyResult> {
  const form = new FormData();
  form.append("ticket_id", ticketId);
  form.append("image", image, "verify.jpg");
  const raw = await request<{
    verified: boolean;
    similarity?: number;
    threshold?: number;
    verdict: FaceVerifyVerdict;
    liveness?: { is_real: boolean; score: number };
    entry_log_id?: string;
    ticket?: ApiTicket;
  }>("/api/v1/tickets/verify/", {
    method: "POST",
    headers: { "X-Kiosk-Api-Key": kioskApiKey },
    body: form,
  });
  return {
    verified: raw.verified,
    similarity: raw.similarity,
    threshold: raw.threshold,
    verdict: raw.verdict,
    liveness: raw.liveness ? { isReal: raw.liveness.is_real, score: raw.liveness.score } : undefined,
    entryLogId: raw.entry_log_id,
    ticket: raw.ticket ? mapTicket(raw.ticket) : undefined,
  };
}
