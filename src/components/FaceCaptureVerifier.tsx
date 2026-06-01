"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { mediaDb } from "@/lib/db";
import { blobToDataUrl, getEntryResult, getResultTone } from "@/lib/utils";
import { createEntryLog, createFaceCapture } from "@/lib/mock";
import { Button } from "@/components/Button";
import { StatusCard } from "@/components/StatusCard";
import type { Ticket } from "@/types/models";

export function FaceCaptureVerifier({ ticket }: { ticket: Ticket }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultText, setResultText] = useState("");
  const [similarity, setSimilarity] = useState<number | null>(null);

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;

    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [cameraOn]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const startCamera = async () => {
    setPreviewUrl("");
    setSimilarity(null);
    setResultText("");

    if (!streamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
    }

    setCameraOn(true);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;

    const blobId = uuid();
    await mediaDb.saveImage(blobId, blob);
    createFaceCapture(ticket.id, ticket.holderUserId, blobId);
    setPreviewUrl(await blobToDataUrl(blob));

    const mockSimilarity = Math.floor(55 + Math.random() * 45);
    const result = getEntryResult(mockSimilarity);

    createEntryLog({
      ticketId: ticket.id,
      holderUserId: ticket.holderUserId,
      qrValid: true,
      zkValid: true,
      faceSimilarity: mockSimilarity,
      result,
    });

    setSimilarity(mockSimilarity);
    setResultText(
      result === "allowed" ? "입장 가능" : result === "manual_review" ? "관리자 확인 필요" : "입장 불가",
    );
    setCameraOn(false);
  };

  return (
    <div className="list list--compact">
      <div className="button-row button-row--dense">
        <Button onClick={startCamera}>
          {previewUrl ? "재촬영하기" : "얼굴촬영"}
        </Button>
        {cameraOn ? (
          <Button onClick={capture} variant="secondary">
            촬영하기
          </Button>
        ) : null}
      </div>
      {cameraOn ? (
        <div className="camera-frame camera-frame--compact face-capture-frame">
          <video ref={videoRef} muted playsInline />
        </div>
      ) : null}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {previewUrl ? <img src={previewUrl} alt="capture preview" className="preview-image preview-image--compact" /> : null}
      {similarity !== null ? (
        <StatusCard
          title={`${similarity}% / ${resultText}`}
          description="실제 AI 비교 대신 유사도 기반 mock 판정으로 기록했습니다."
          tone={getResultTone(getEntryResult(similarity))}
        />
      ) : null}
    </div>
  );
}
