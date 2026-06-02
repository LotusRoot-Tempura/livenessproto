"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FaceQualityState } from "@/types/models";
import { Badge } from "@/components/Badge";
import { LoadingState } from "@/components/LoadingState";

type LandmarkPoint = {
  x: number;
  y: number;
};

const TFLITE_INFO_LOG = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
  149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;
const NOSE_TIP = 1;

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

function withSuppressedTfliteInfo<T>(callback: () => T): T | null {
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    const firstArg = args[0];
    if (typeof firstArg === "string" && firstArg.includes(TFLITE_INFO_LOG)) {
      return;
    }
    originalConsoleError(...args);
  };

  try {
    return callback();
  } catch (error) {
    if (error instanceof Error && error.message.includes(TFLITE_INFO_LOG)) {
      return null;
    }
    throw error;
  } finally {
    console.error = originalConsoleError;
  }
}

function distance(a: LandmarkPoint, b: LandmarkPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getFaceBounds(landmarks: LandmarkPoint[]) {
  const xs = FACE_OVAL.map((index) => landmarks[index]?.x).filter((value): value is number => typeof value === "number");
  const ys = FACE_OVAL.map((index) => landmarks[index]?.y).filter((value): value is number => typeof value === "number");
  if (!xs.length || !ys.length) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0.0001, maxX - minX),
    height: Math.max(0.0001, maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function getEyeAspectRatio(
  outer: LandmarkPoint,
  inner: LandmarkPoint,
  top: LandmarkPoint,
  bottom: LandmarkPoint,
) {
  const eyeWidth = distance(outer, inner);
  if (eyeWidth <= 0.0001) return 0;
  const eyeHeight = distance(top, bottom);
  return eyeHeight / eyeWidth;
}

export function FaceQualityCheck({
  videoRef,
  onReadyStateChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReadyStateChange?: (ready: boolean) => void;
}) {
  const [state, setState] = useState<FaceQualityState>(initialState);
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const loopRef = useRef<number | null>(null);
  const challengeRef = useRef({
    rightAngle: false,
    leftAngle: false,
    blinkDetected: false,
    eyesWereOpen: false,
  });

  useEffect(() => {
    let cancelled = false;
    let faceLandmarker: {
      detectForVideo: (video: HTMLVideoElement, timestamp: number) => { faceLandmarks?: LandmarkPoint[][] };
      close?: () => void;
    } | null = null;
    const originalConsoleError = console.error;

    console.error = (...args: unknown[]) => {
      const firstArg = args[0];
      if (typeof firstArg === "string" && firstArg.includes(TFLITE_INFO_LOG)) {
        return;
      }
      originalConsoleError(...args);
    };

    async function setup() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const resolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );

        faceLandmarker = await vision.FaceLandmarker.createFromOptions(resolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });

        if (cancelled) return;
        setModelReady(true);

        const run = () => {
          if (cancelled) return;

          const video = videoRef.current;
          if (!video || video.readyState < 2 || !faceLandmarker) {
            loopRef.current = requestAnimationFrame(run);
            return;
          }

          const result = withSuppressedTfliteInfo(() => faceLandmarker?.detectForVideo(video, performance.now()));
          const landmarks = result?.faceLandmarks?.[0];

          if (!landmarks) {
            challengeRef.current = {
              rightAngle: false,
              leftAngle: false,
              blinkDetected: false,
              eyesWereOpen: false,
            };
            setState({
              ...initialState,
              message: "얼굴이 화면에 잘 보이도록 카메라 중앙으로 맞춰 주세요.",
            });
            loopRef.current = requestAnimationFrame(run);
            return;
          }

          const bounds = getFaceBounds(landmarks);
          const leftEyeOuter = landmarks[LEFT_EYE_OUTER];
          const leftEyeInner = landmarks[LEFT_EYE_INNER];
          const rightEyeInner = landmarks[RIGHT_EYE_INNER];
          const rightEyeOuter = landmarks[RIGHT_EYE_OUTER];
          const leftEyeTop = landmarks[LEFT_EYE_TOP];
          const leftEyeBottom = landmarks[LEFT_EYE_BOTTOM];
          const rightEyeTop = landmarks[RIGHT_EYE_TOP];
          const rightEyeBottom = landmarks[RIGHT_EYE_BOTTOM];
          const noseTip = landmarks[NOSE_TIP];

          if (
            !bounds ||
            !leftEyeOuter ||
            !leftEyeInner ||
            !rightEyeInner ||
            !rightEyeOuter ||
            !leftEyeTop ||
            !leftEyeBottom ||
            !rightEyeTop ||
            !rightEyeBottom ||
            !noseTip
          ) {
            setState({
              ...initialState,
              message: "얼굴 특징점을 충분히 읽지 못했습니다. 조명을 밝게 하고 다시 맞춰 주세요.",
            });
            loopRef.current = requestAnimationFrame(run);
            return;
          }

          const centered = Math.abs(bounds.centerX - 0.5) < 0.1 && Math.abs(bounds.centerY - 0.52) < 0.12;
          const properSize = bounds.width > 0.22 && bounds.width < 0.58 && bounds.height > 0.32 && bounds.height < 0.78;
          const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
          const yawRatio = (noseTip.x - eyeCenterX) / Math.max(0.0001, bounds.width);
          const frontFacing = Math.abs(yawRatio) < 0.035;
          const turnedRight = yawRatio > 0.055;
          const turnedLeft = yawRatio < -0.055;

          if (turnedRight) {
            challengeRef.current.rightAngle = true;
          }
          if (turnedLeft) {
            challengeRef.current.leftAngle = true;
          }

          const leftEar = getEyeAspectRatio(leftEyeOuter, leftEyeInner, leftEyeTop, leftEyeBottom);
          const rightEar = getEyeAspectRatio(rightEyeOuter, rightEyeInner, rightEyeTop, rightEyeBottom);
          const averageEar = (leftEar + rightEar) / 2;

          if (averageEar > 0.24) {
            challengeRef.current.eyesWereOpen = true;
          }
          if (challengeRef.current.eyesWereOpen && averageEar < 0.18) {
            challengeRef.current.blinkDetected = true;
          }

          const next: FaceQualityState = {
            detected: true,
            centered,
            properSize,
            frontFacing,
            rightAngle: challengeRef.current.rightAngle,
            leftAngle: challengeRef.current.leftAngle,
            blinkDetected: challengeRef.current.blinkDetected,
            score: 0,
            readyToRecord: false,
            message: "정면, 좌우 고개 움직임, 눈 깜빡임을 실제로 확인 중입니다.",
          };

          const scoreChecks = [
            next.detected,
            next.centered,
            next.properSize,
            next.frontFacing,
            next.rightAngle,
            next.leftAngle,
            next.blinkDetected,
          ];
          next.score = Math.round((scoreChecks.filter(Boolean).length / scoreChecks.length) * 100);
          next.readyToRecord = scoreChecks.every(Boolean);

          if (!next.centered) {
            next.message = "얼굴을 화면 중앙으로 맞춰 주세요.";
          } else if (!next.properSize) {
            next.message = "얼굴이 너무 가깝거나 멉니다. 적정 거리로 맞춰 주세요.";
          } else if (!next.frontFacing) {
            next.message = "먼저 정면을 바라봐 주세요.";
          } else if (!next.rightAngle) {
            next.message = "고개를 오른쪽으로 돌려 실제 움직임을 보여 주세요.";
          } else if (!next.leftAngle) {
            next.message = "고개를 왼쪽으로 돌려 실제 움직임을 보여 주세요.";
          } else if (!next.blinkDetected) {
            next.message = "마지막으로 눈을 한 번 깜빡여 주세요.";
          } else if (next.readyToRecord) {
            next.message = "실제 얼굴 움직임이 확인되었습니다. 촬영 적합 상태입니다.";
          }

          setState(next);
          onReadyStateChange?.(next.readyToRecord);
          loopRef.current = requestAnimationFrame(run);
        };

        loopRef.current = requestAnimationFrame(run);
      } catch {
        if (!cancelled) {
          setModelFailed(true);
          setState({
            ...initialState,
            message: "얼굴 라이브니스 모델을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.",
          });
          setModelReady(true);
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      console.error = originalConsoleError;
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
      faceLandmarker = null;
    };
  }, [onReadyStateChange, videoRef]);

  const checks = useMemo<[string, boolean][]>(
    () => [
      ["얼굴 감지", state.detected],
      ["중앙 정렬", state.centered],
      ["적정 크기", state.properSize],
      ["정면", state.frontFacing],
      ["오른쪽 회전", state.rightAngle],
      ["왼쪽 회전", state.leftAngle],
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
      <p className="helper-text">
        {modelFailed
          ? "라이브니스 검사를 완료하지 못했습니다."
          : state.readyToRecord
            ? "실제 얼굴 움직임 확인 완료"
            : "사진이 아니라 실제 얼굴 움직임이 필요합니다."}
      </p>
    </div>
  );
}
