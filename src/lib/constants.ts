export const STORAGE_KEYS = {
  users: "gtf_users",
  faceProfiles: "gtf_face_profiles",
  tickets: "gtf_tickets",
  transferHistory: "gtf_transfer_history",
  zkIdentities: "gtf_zk_identities",
  entryLogs: "gtf_entry_logs",
  faceCaptures: "gtf_face_captures",
} as const;

export const MENU_ITEMS = [
  { href: "/", label: "홈", description: "운영 현황과 주요 기능 이동" },
  { href: "/users", label: "이용자 등록", description: "이름, 연락처 등록 및 목록 확인" },
  { href: "/face-register", label: "얼굴 영상 등록", description: "안내 확인 후 카메라 녹화 저장" },
  { href: "/tickets/create", label: "티켓 생성", description: "구매자 선택 후 QR 티켓 생성" },
  { href: "/tickets", label: "티켓 목록", description: "입장자 변경 및 QR 확인" },
  { href: "/verify", label: "QR 인증", description: "현장 스캔과 얼굴 인증 mock" },
  { href: "/logs", label: "입장 로그", description: "승인, 수동확인, 거부 기록 열람" },
];

export const TAB_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/users", label: "이용자" },
  { href: "/face-register", label: "얼굴등록" },
  { href: "/tickets/create", label: "티켓생성" },
  { href: "/tickets", label: "티켓목록" },
  { href: "/verify", label: "QR인증" },
  { href: "/logs", label: "입장로그" },
];
