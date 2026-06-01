import type { Metadata } from "next";
import "@/styles/globals.css";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { APP_VERSION, APP_VERSION_UPDATED_AT } from "@/lib/appVersion";

const VERSION_UPDATED_LABEL = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
}).format(new Date(APP_VERSION_UPDATED_AT));

export const metadata: Metadata = {
  title: "Grab Ticket Face MVP",
  description: "QR + 얼굴 등록 + 얼굴 인증 기반 티켓 입장 MVP",
  manifest: "/manifest.webmanifest",
  applicationName: "Grab Ticket Face MVP",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Grab Ticket",
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: "#165dff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <PwaRegistrar />
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar__content">
              <div>
                <p className="eyebrow">현장 스태프 운영 앱</p>
                <h1>Grab Ticket Face MVP</h1>
              </div>
              <div className="version-badge" aria-label={`앱 버전 ${APP_VERSION}, 갱신 ${VERSION_UPDATED_LABEL}`}>
                <strong>v{APP_VERSION}</strong>
                <span>{VERSION_UPDATED_LABEL}</span>
              </div>
            </div>
          </header>
          <main className="page-shell">{children}</main>
          <MobileTabBar />
        </div>
      </body>
    </html>
  );
}
