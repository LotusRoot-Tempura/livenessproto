"use client";

import { useEffect, useRef, useState } from "react";
import { localStore } from "@/lib/storage";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { StatusCard } from "@/components/StatusCard";
import { FaceCaptureVerifier } from "@/components/FaceCaptureVerifier";
import type { Ticket } from "@/types/models";

export function QrVerificationFlow() {
  const scannerRef = useRef<HTMLDivElement | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      const current = scannerRef.current;
      if (current) current.innerHTML = "";
    };
  }, []);

  const clearScannerFrame = () => {
    const current = scannerRef.current;
    if (current) current.innerHTML = "";
  };

  const resetScanResult = () => {
    setTicket(null);
    setScannerReady(false);
    clearScannerFrame();
  };

  const startScanner = async () => {
    setLoading(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const readerId = "qr-reader";
      resetScanResult();
      const scanner = new Html5Qrcode(readerId);
      setScannerReady(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        async (decodedText) => {
          const found = localStore.getTickets().find((item) => item.id === decodedText) ?? null;
          setTicket(found);
          await scanner.stop();
          clearScannerFrame();
          setScannerReady(false);
        },
        () => undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  const manualLoadLatest = () => {
    const latest = localStore.getTickets()[0] ?? null;
    setTicket(latest);
    clearScannerFrame();
    setScannerReady(false);
  };

  const handleRescan = () => {
    void startScanner();
  };

  return (
    <div className="list">
      <div className="button-row">
        <Button onClick={startScanner}>QR 스캔 시작</Button>
        <Button onClick={manualLoadLatest} variant="secondary">
          최신 티켓으로 테스트
        </Button>
      </div>
      <p className="helper-text">iOS Safari 등 모바일 환경에서는 카메라 권한 허용 후 HTTPS 또는 localhost에서 동작합니다.</p>
      {!ticket ? <div id="qr-reader" ref={scannerRef} className="panel" /> : null}
      {loading ? <LoadingState text="QR 스캐너를 준비하고 있습니다." /> : null}
      {!ticket && !scannerReady ? (
        <EmptyState title="아직 스캔된 티켓이 없습니다." description="현장 QR을 스캔하거나 테스트 버튼을 사용해 주세요." />
      ) : null}
      {ticket ? (
        <>
          <div className="button-row">
            <Button onClick={handleRescan} variant="secondary">
              다시 스캔
            </Button>
          </div>
          <StatusCard title="티켓 유효성 확인 완료" description={`${ticket.eventName} / ${ticket.seatNo}`} tone="success" />
          <StatusCard
            title="ZK 권한 검증 완료 mock"
            description="로컬 저장 mock commitment 기준으로 확인 처리했습니다."
            tone="info"
          />
          <StatusCard title="얼굴 인증 필요" description="이제 현장 얼굴 캡처 후 mock 판정을 진행합니다." tone="warning" />
          <FaceCaptureVerifier ticket={ticket} />
        </>
      ) : null}
    </div>
  );
}
