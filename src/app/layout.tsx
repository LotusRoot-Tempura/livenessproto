import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Active Liveness Prototype",
  description: "MediaPipe 기반 active liveness UI/UX 프로토타입",
  applicationName: "Active Liveness Prototype",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Liveness",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <main className="liveness-app">{children}</main>
      </body>
    </html>
  );
}
