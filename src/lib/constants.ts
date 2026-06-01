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

export const MENU_ITEMS = [
  { href: "/", label: "홈", description: "운영 현황과 주요 기능으로 이동합니다." },
  { href: "/users", label: "이용자 등록", description: "이름, 연락처 등록 및 목록을 확인합니다." },
  { href: "/face-register", label: "얼굴등록", description: "촬영 가이드를 보고 얼굴 등록을 진행합니다." },
  { href: "/performances", label: "공연등록", description: "공연명, 공연일, 좌석수, 가수명을 등록합니다." },
  { href: "/tickets/create", label: "티켓생성", description: "등록된 공연을 선택해 QR 티켓을 생성합니다." },
  { href: "/tickets", label: "티켓목록", description: "티켓 목록과 입장자 변경 상태를 확인합니다." },
  { href: "/verify", label: "QR인증", description: "현장에서 QR과 얼굴 인증 mock을 진행합니다." },
  { href: "/logs", label: "입장로그", description: "입장 결과와 확인 기록을 봅니다." },
] as const;

export const TAB_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/users", label: "이용자" },
  { href: "/face-register", label: "얼굴등록" },
  { href: "/performances", label: "공연등록" },
  { href: "/tickets/create", label: "티켓생성" },
  { href: "/tickets", label: "티켓목록" },
  { href: "/verify", label: "QR인증" },
  { href: "/logs", label: "입장로그" },
] as const;
