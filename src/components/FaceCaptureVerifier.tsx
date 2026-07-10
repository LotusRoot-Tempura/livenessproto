"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { mediaDb } from "@/lib/db";
import { blobToDataUrl } from "@/lib/utils";
import { createFaceCapture } from "@/lib/mock";
import { ApiError, FaceVerifyResult, apiVerifyFace } from "@/lib/api";
import { Button } from "@/components/Button";
import { StatusCard } from "@/components/StatusCard";
import type { Ticket } from "@/types/models";

const VERDICT_TEXT: Record<FaceVerifyResult["verdict"], string> = {
  allowed: "입장 가능",
  manual_review: "관리자 확인 필요",
  denied: "입장 불가",
  spoof: "위조 감지 (사진·화면)",
};

function verdictTone(verdict: FaceVerifyResult["verdict"]): "success" | "warning" | "danger" {
  if (verdict === "allowed") return "success";
  if (verdict === "manual_review") return "warning";
  return "danger";
}

export function FaceCaptureVerifier({ ticket }: { ticket: Ticket }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<FaceVerifyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {
      // iOS 자동재생 정책 등으로 거부될 수 있음 — autoPlay 속성이 재시도한다.
    });
  }, [cameraOn]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setPreviewUrl("");
    setResult(null);
    setErrorMessage("");
    setVideoReady(false);

    if (!streamRef.current) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } catch (firstError) {
        // 직전 QR 스캔이 카메라를 아직 쥐고 있거나 전면 카메라가 없는 기기 대응:
        // 잠시 대기 후 제약 없이 1회 재시도한다.
        try {
          stopStream();
          await new Promise((resolve) => setTimeout(resolve, 500));
          streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          const name = firstError instanceof DOMException ? firstError.name : "";
          setErrorMessage(
            name === "NotAllowedError"
              ? "카메라 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해 주세요."
              : "카메라를 시작할 수 없습니다. 다른 앱/탭이 카메라를 사용 중인지 확인 후 다시 시도해 주세요.",
          );
          return;
        }
      }
    }

    setCameraOn(true);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // 비디오 프레임이 아직 준비되지 않았으면(크기 0) 촬영 불가 — 안내 후 중단
    if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setErrorMessage("카메라 영상이 아직 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요.");
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setErrorMessage("촬영 이미지를 생성하지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    // 로컬 캡처 보관은 부가 기능 — Safari 프라이빗 모드 등에서 IndexedDB 가
    // 실패해도 인증(verify)은 계속 진행한다.
    try {
      const blobId = uuid();
      await mediaDb.saveImage(blobId, blob);
      createFaceCapture(ticket.id, ticket.holderUserId, blobId);
    } catch {
      // 저장 실패 무시 (검증 흐름에 영향 없음)
    }
    try {
      setPreviewUrl(await blobToDataUrl(blob));
    } catch {
      setPreviewUrl("");
    }
    setCameraOn(false);
    setVideoReady(false);

    // 백엔드 1:1 얼굴 비교(holder 등록 임베딩 대조) + 입장 처리 + EntryLog 기록
    setVerifying(true);
    setErrorMessage("");
    try {
      const verifyResult = await apiVerifyFace(ticket.id, blob);
      setResult(verifyResult);
    } catch (error) {
      setResult(null);
      setErrorMessage(error instanceof ApiError ? error.message : "얼굴 인증에 실패했습니다.");
    } finally {
      setVerifying(false);
    }
  };

  const similarityPercent =
    result?.similarity !== undefined ? Math.round(result.similarity * 100) : null;

  return (
    <div className="list list--compact">
      <div className="button-row button-row--dense">
        <Button onClick={startCamera} disabled={verifying}>
          {previewUrl ? "재촬영하기" : "얼굴촬영"}
        </Button>
        {cameraOn ? (
          <Button onClick={capture} variant="secondary" disabled={verifying || !videoReady}>
            {videoReady ? "촬영하기" : "카메라 준비 중…"}
          </Button>
        ) : null}
      </div>
      {cameraOn ? (
        <div className="camera-frame camera-frame--compact face-capture-frame">
          {/* iOS Safari 는 메타데이터 로드 전 videoWidth=0 — 준비 완료 후에만 촬영 허용 */}
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            onLoadedMetadata={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
          />
        </div>
      ) : null}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {previewUrl ? <img src={previewUrl} alt="capture preview" className="preview-image preview-image--compact" /> : null}
      {verifying ? <StatusCard title="얼굴 인증 중…" description="등록된 구매자 얼굴과 비교하고 있습니다." tone="info" /> : null}
      {errorMessage ? <StatusCard title="얼굴 인증 실패" description={errorMessage} tone="danger" /> : null}
      {result ? (
        <StatusCard
          title={`${VERDICT_TEXT[result.verdict]}${similarityPercent !== null ? ` (유사도 ${similarityPercent}%)` : ""}`}
          description={
            result.verdict === "spoof"
              ? "사진·화면 위조로 판정되어 입장이 차단되었습니다."
              : `백엔드 1:1 얼굴 대조 결과입니다. (verified: ${result.verified ? "통과" : "미통과"})`
          }
          tone={verdictTone(result.verdict)}
        />
      ) : null}
    </div>
  );
}
