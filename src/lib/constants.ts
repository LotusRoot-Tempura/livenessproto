export const STORAGE_KEYS = {
  users: "gtf_users",
  faceProfiles: "gtf_face_profiles",
  performances: "gtf_performances",
  tickets: "gtf_tickets",
  transferHistory: "gtf_transfer_history",
  zkIdentities: "gtf_zk_identities",
  entryLogs: "gtf_entry_logs",
  faceCaptures: "gtf_face_captures",
} as const;

export type AppRole = "user" | "venue-tablet" | "tablet-admin";

export type NavItem = {
  href: string;
  label: string;
  description: string;
};

type RoleDefinition = {
  key: AppRole;
  href: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const ROLE_ITEMS: readonly RoleDefinition[] = [
  {
    key: "user",
    href: "/user/profile",
    label: "이용자",
    shortLabel: "이용자",
    description: "얼굴등록, 티켓구매, 프로필을 확인합니다.",
  },
  {
    key: "venue-tablet",
    href: "/venue/qr-scan",
    label: "공연장 테블릿",
    shortLabel: "공연장",
    description: "QR스캔과 얼굴 인증으로 입장을 확인합니다.",
  },
  {
    key: "tablet-admin",
    href: "/admin/members",
    label: "테블릿 관리자",
    shortLabel: "관리자",
    description: "회원가입 목록, 공연등록, 티켓등록, 입장로그를 관리합니다.",
  },
] as const;

export const USER_APP_MENU_ITEMS: readonly NavItem[] = [
  { href: "/user/face-register", label: "얼굴등록", description: "이용자 얼굴 영상을 등록합니다." },
  { href: "/user/tickets/create", label: "티켓구매", description: "공연 티켓을 생성하고 구매 흐름을 진행합니다." },
  { href: "/user/profile", label: "프로필", description: "현재 로그인한 회원 정보를 확인합니다." },
] as const;

export const VENUE_TABLET_MENU_ITEMS: readonly NavItem[] = [
  { href: "/venue/qr-scan", label: "QR스캔", description: "입장 티켓 QR을 스캔합니다." },
  { href: "/venue/face-auth", label: "얼굴 인증", description: "스캔한 티켓 기준으로 얼굴 인증을 진행합니다." },
  { href: "/venue/profile", label: "프로필", description: "현재 로그인한 계정 정보를 확인합니다." },
] as const;

export const TABLET_ADMIN_MENU_ITEMS: readonly NavItem[] = [
  { href: "/admin/members", label: "회원목록", description: "등록된 회원 목록을 확인합니다." },
  { href: "/admin/performances", label: "공연등록", description: "공연장과 공연 정보를 등록합니다." },
  { href: "/admin/tickets", label: "티겟등록", description: "생성된 티켓을 관리합니다." },
  { href: "/admin/qr-scan", label: "입장확인", description: "티켓 QR 스캔과 얼굴 인증으로 입장을 확인합니다." },
  { href: "/admin/logs", label: "입장로그", description: "입장 결과와 이력을 확인합니다." },
  { href: "/admin/profile", label: "프로필", description: "현재 로그인한 관리자 정보를 확인합니다." },
] as const;

const ROLE_PATH_MATCHERS: Record<AppRole, readonly string[]> = {
  user: ["/user", "/face-register"],
  "venue-tablet": ["/venue", "/verify"],
  "tablet-admin": ["/admin", "/performances", "/tickets", "/logs"],
};

export function getRoleByPathname(pathname: string): AppRole | null {
  for (const role of ROLE_ITEMS) {
    if (ROLE_PATH_MATCHERS[role.key].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return role.key;
    }
  }

  return null;
}

export function getMenuItemsByRole(role: AppRole | null): readonly NavItem[] {
  switch (role) {
    case "user":
      return USER_APP_MENU_ITEMS;
    case "venue-tablet":
      return VENUE_TABLET_MENU_ITEMS;
    case "tablet-admin":
      return TABLET_ADMIN_MENU_ITEMS;
    default:
      return [];
  }
}

export function getRoleLabel(role: AppRole | null): string {
  if (!role) return "메인 홈";
  return ROLE_ITEMS.find((item) => item.key === role)?.label ?? "메인 홈";
}
