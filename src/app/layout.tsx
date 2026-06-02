import type { Metadata } from "next";
import "@/styles/globals.css";
import { MobileTabBar } from "@/components/MobileTabBar";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { TopbarStatus } from "@/components/TopbarStatus";

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
            <TopbarStatus />
          </header>
          <main className="page-shell">{children}</main>
          <MobileTabBar />
        </div>
      </body>
    </html>
  );
}
