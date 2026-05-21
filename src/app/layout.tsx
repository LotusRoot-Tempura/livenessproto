import type { Metadata } from "next";
import "@/styles/globals.css";
import { MobileTabBar } from "@/components/MobileTabBar";

export const metadata: Metadata = {
  title: "Grab Ticket Face MVP",
  description: "QR + 얼굴 등록 + 얼굴 인증 기반 티켓 입장 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">현장 스태프 운영 앱</p>
              <h1>Grab Ticket Face MVP</h1>
            </div>
          </header>
          <main className="page-shell">{children}</main>
          <MobileTabBar />
        </div>
      </body>
    </html>
  );
}
