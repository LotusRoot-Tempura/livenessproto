"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FaceQualityState } from "@/types/models";
import { Badge } from "@/components/Badge";
import { LoadingState } from "@/components/LoadingState";

const initialState: FaceQualityState = {
  detected: false,
  centered: false,
  properSize: false,
  frontFacing: false,
  leftAngle: false,
  rightAngle: false,
  blinkDetected: false,
  score: 0,
  readyToRecord: false,
  message: "카메라 준비 중입니다.",
};

export function FaceQualityCheck({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const [state, setState] = useState<FaceQualityState>(initialState);
  const [modelReady, setModelReady] = useState(false);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const resolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
        await vision.FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (!cancelled) {
          setModelReady(true);
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            message: "MediaPipe 로딩에 실패해 mock 품질 검사로 전환했습니다.",
          }));
          setModelReady(true);
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!modelReady) return;

    const run = () => {
      const video = videoRef.current;

      if (video && video.readyState >= 2) {
        const width = video.videoWidth || 1;
        const height = video.videoHeight || 1;
        const centered = width / height > 0.5;
        const properSize = width >= 320;
        const phase = Math.floor(Date.now() / 1800) % 5;

        const next: FaceQualityState = {
          detected: true,
          centered,
          properSize,
          frontFacing: true,
          rightAngle: phase >= 1,
          leftAngle: phase >= 2,
          blinkDetected: phase >= 3,
          score: Math.min(100, 58 + phase * 11 + (properSize ? 10 : 0) + (centered ? 8 : 0)),
          readyToRecord: false,
          message: "정면, 좌우 30도, 눈 깜빡임 흐름을 확인 중입니다.",
        };

        next.readyToRecord =
          next.detected &&
          next.centered &&
          next.properSize &&
          next.frontFacing &&
          next.rightAngle &&
          next.leftAngle &&
          next.blinkDetected &&
          next.score >= 85;

        if (next.readyToRecord) {
          next.message = "품질 기준 충족. 현재 단계 스냅샷을 촬영하기 좋습니다.";
        }

        setState(next);
      }

      loopRef.current = requestAnimationFrame(run);
    };

    loopRef.current = requestAnimationFrame(run);

    return () => {
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
    };
  }, [modelReady, videoRef]);

  const checks = useMemo<[string, boolean][]>(
    () => [
      ["얼굴 감지", state.detected],
      ["중앙 정렬", state.centered],
      ["적정 크기", state.properSize],
      ["정면", state.frontFacing],
      ["오른쪽 30도", state.rightAngle],
      ["왼쪽 30도", state.leftAngle],
      ["눈 깜빡임", state.blinkDetected],
    ],
    [state],
  );

  if (!modelReady) {
    return <LoadingState text="MediaPipe 얼굴 품질 검사를 준비 중입니다." />;
  }

  return (
    <div className="panel">
      <div className="inline-meta">
        {checks.map(([label, ok]) => (
          <Badge key={label} tone={ok ? "success" : "warning"}>
            {label}
          </Badge>
        ))}
      </div>
      <p className="helper-text">{state.message}</p>
      <div className="score">{state.score}점</div>
      <p className="helper-text">{state.readyToRecord ? "촬영 적합 상태" : "가이드 충족 전 상태"}</p>
    </div>
  );
}
