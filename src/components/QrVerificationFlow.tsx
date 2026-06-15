"use client";

import { useEffect, useRef, useState } from "react";
import { localStore } from "@/lib/storage";
import { ApiError, apiCheckQr } from "@/lib/api";
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
  const [scanError, setScanError] = useState("");

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
    setScanError("");
    setScannerReady(false);
    clearScannerFrame();
  };

  // 스캔/디코드된 해시를 백엔드 qrcode API로 대조한다.
  const checkHash = async (qrHash: string) => {
    try {
      const result = await apiCheckQr(qrHash);
      if (result.matched && result.valid && result.ticket) {
        // 입장 진행 가능: 백엔드 티켓을 로컬에 반영하고 얼굴 인증 단계로 넘어간다.
        localStore.saveTickets([
          result.ticket,
          ...localStore.getTickets().filter((item) => item.id !== result.ticket!.id),
        ]);
        setTicket(result.ticket);
        setScanError("");
      } else if (result.matched) {
        setTicket(null);
        setScanError(`입장할 수 없는 티켓입니다. (상태: ${result.status ?? "확인 불가"})`);
      } else {
        setTicket(null);
        setScanError("일치하는 티켓을 찾을 수 없습니다. QR을 다시 확인해 주세요.");
      }
    } catch (error) {
      setTicket(null);
      setScanError(error instanceof ApiError ? error.message : "QR 확인에 실패했습니다.");
    }
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
          await scanner.stop();
          clearScannerFrame();
          setScannerReady(false);
          await checkHash(decodedText);
        },
        () => undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  // 카메라 없이 테스트: 최신 티켓의 QR 해시로 백엔드 대조를 수행한다.
  const manualLoadLatest = async () => {
    const latest = localStore.getTickets()[0];
    clearScannerFrame();
    setScannerReady(false);
    if (!latest?.qrHash) {
      setTicket(null);
      setScanError("테스트할 티켓(QR 해시)이 없습니다. 먼저 티켓을 구매해 주세요.");
      return;
    }
    await checkHash(latest.qrHash);
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
      {scanError ? <StatusCard title="QR 확인 실패" description={scanError} tone="warning" /> : null}
      {!ticket && !scannerReady && !scanError ? (
        <EmptyState title="아직 스캔된 티켓이 없습니다." description="현장 QR을 스캔하거나 테스트 버튼을 사용해 주세요." />
      ) : null}
      {ticket ? (
        <>
          <div className="button-row">
            <Button onClick={handleRescan} variant="secondary">
              다시 스캔
            </Button>
          </div>
          <StatusCard
            title="QR 확인 완료"
            description={`${ticket.eventName} / 좌석 ${ticket.seatNo}`}
            tone="success"
          />
          <StatusCard title="얼굴 인증 필요" description="이제 현장 얼굴 캡처 후 구매자 본인 여부를 확인합니다." tone="warning" />
          <FaceCaptureVerifier ticket={ticket} />
        </>
      ) : null}
    </div>
  );
}
