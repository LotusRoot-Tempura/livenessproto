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
  singleFace: false,
  centered: false,
  properSize: false,
  lightingGood: false,
  frontFacing: false,
  leftAngle: false,
  rightAngle: false,
  blinkDetected: false,
  occlusionClear: false,
  score: 0,
  readyToRecord: false,
  message: "카메라 준비 중입니다.",
};

const AUTO_CAPTURE_SCORE_THRESHOLD = 80;

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

function getFrameLighting(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = 32;
  const height = 24;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { brightness: 0, contrast: 0, good: false };
  }

  ctx.drawImage(video, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  let brightnessTotal = 0;
  const luminances: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    brightnessTotal += luminance;
    luminances.push(luminance);
  }

  const brightness = brightnessTotal / Math.max(1, luminances.length);
  const variance =
    luminances.reduce((sum, luminance) => sum + Math.pow(luminance - brightness, 2), 0) / Math.max(1, luminances.length);
  const contrast = Math.sqrt(variance);
  const good = brightness >= 50 && brightness <= 220 && contrast >= 14;

  return { brightness, contrast, good };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function scoreBoolean(value: boolean) {
  return value ? 1 : 0;
}

function scoreCentered(center: number, target: number, tolerance: number) {
  return clamp01(1 - Math.abs(center - target) / tolerance);
}

function scoreRange(value: number, min: number, max: number, softMargin: number) {
  if (value >= min && value <= max) return 1;
  if (value < min) return clamp01(1 - (min - value) / softMargin);
  return clamp01(1 - (value - max) / softMargin);
}

function scoreFrontFacing(yawRatio: number) {
  return clamp01(1 - Math.abs(yawRatio) / 0.08);
}

function scoreTurnProgress(yawRatio: number, direction: "right" | "left", completed: boolean) {
  if (completed) return 1;
  const target = direction === "right" ? yawRatio : -yawRatio;
  return clamp01((target - 0.005) / 0.05);
}

function scoreBlinkProgress(averageEar: number, blinkDetected: boolean, eyesWereOpen: boolean) {
  if (blinkDetected) return 1;
  if (eyesWereOpen) {
    return clamp01((0.24 - averageEar) / 0.08);
  }
  return clamp01(averageEar / 0.24) * 0.4;
}

function scoreOcclusion(occlusionCounter: number) {
  return clamp01(1 - occlusionCounter / 15);
}

function scoreLighting(brightness: number, contrast: number) {
  const brightnessScore = scoreRange(brightness, 60, 210, 45);
  const contrastScore = scoreRange(contrast, 20, 90, 18);
  return (brightnessScore + contrastScore) / 2;
}

export function FaceQualityCheck({
  videoRef,
  onReadyStateChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onReadyStateChange?: (ready: boolean) => void;
}) {
  const [state, setState] = useState<FaceQualityState>(initialState);
  const [checkProgress, setCheckProgress] = useState<Record<string, number>>({
    detected: 0,
    singleFace: 0,
    centered: 0,
    properSize: 0,
    lightingGood: 0,
    occlusionClear: 0,
    frontFacing: 0,
    rightAngle: 0,
    leftAngle: 0,
    blinkDetected: 0,
  });
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const loopRef = useRef<number | null>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const challengeRef = useRef({
    frontFacingSeen: false,
    rightAngle: false,
    leftAngle: false,
    blinkDetected: false,
    eyesWereOpen: false,
    frontFacingProgress: 0,
    rightProgress: 0,
    leftProgress: 0,
    blinkProgress: 0,
  });
  const occlusionCounterRef = useRef(0);

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
          numFaces: 2,
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
          const faces = result?.faceLandmarks ?? [];
          const landmarks = result?.faceLandmarks?.[0];

          if (!landmarks) {
            challengeRef.current = {
              frontFacingSeen: false,
              rightAngle: false,
              leftAngle: false,
              blinkDetected: false,
              eyesWereOpen: false,
              frontFacingProgress: 0,
              rightProgress: 0,
              leftProgress: 0,
              blinkProgress: 0,
            };
            occlusionCounterRef.current = 0;
            setState({
              ...initialState,
              message: "얼굴이 화면에 잘 보이도록 카메라 중앙으로 맞춰 주세요.",
            });
            setCheckProgress({
              detected: 0,
              singleFace: 0,
              centered: 0,
              properSize: 0,
              lightingGood: 0,
              occlusionClear: 0,
              frontFacing: challengeRef.current.frontFacingProgress,
              rightAngle: challengeRef.current.rightProgress,
              leftAngle: challengeRef.current.leftProgress,
              blinkDetected: challengeRef.current.blinkProgress,
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
          const mouthLeft = landmarks[61];
          const mouthRight = landmarks[291];
          const upperLip = landmarks[13];
          const lowerLip = landmarks[14];

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
            !noseTip ||
            !mouthLeft ||
            !mouthRight ||
            !upperLip ||
            !lowerLip
          ) {
            occlusionCounterRef.current = 0;
            setState({
              ...initialState,
              message: "얼굴 특징점을 충분히 읽지 못했습니다. 조명을 밝게 하고 다시 맞춰 주세요.",
            });
            setCheckProgress({
              detected: 0,
              singleFace: 0,
              centered: 0,
              properSize: 0,
              lightingGood: 0,
              occlusionClear: 0,
              frontFacing: challengeRef.current.frontFacingProgress,
              rightAngle: challengeRef.current.rightProgress,
              leftAngle: challengeRef.current.leftProgress,
              blinkDetected: challengeRef.current.blinkProgress,
            });
            loopRef.current = requestAnimationFrame(run);
            return;
          }

          const centered = Math.abs(bounds.centerX - 0.5) < 0.13 && Math.abs(bounds.centerY - 0.52) < 0.15;
          const properSize = bounds.width > 0.2 && bounds.width < 0.62 && bounds.height > 0.28 && bounds.height < 0.82;
          const singleFace = faces.length === 1;
          const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
          const yawRatio = (noseTip.x - eyeCenterX) / Math.max(0.0001, bounds.width);
          const frontFacing = Math.abs(yawRatio) < 0.05;
          const turnedRight = yawRatio > 0.04;
          const turnedLeft = yawRatio < -0.04;
          const frontFacingProgress = scoreFrontFacing(yawRatio);

          if (frontFacing) {
            challengeRef.current.frontFacingSeen = true;
          }
          challengeRef.current.frontFacingProgress = Math.max(
            challengeRef.current.frontFacingProgress,
            frontFacingProgress,
          );
          if (turnedRight) {
            challengeRef.current.rightAngle = true;
          }
          if (turnedLeft) {
            challengeRef.current.leftAngle = true;
          }
          challengeRef.current.rightProgress = Math.max(
            challengeRef.current.rightProgress,
            scoreTurnProgress(yawRatio, "right", challengeRef.current.rightAngle),
          );
          challengeRef.current.leftProgress = Math.max(
            challengeRef.current.leftProgress,
            scoreTurnProgress(yawRatio, "left", challengeRef.current.leftAngle),
          );

          const leftEar = getEyeAspectRatio(leftEyeOuter, leftEyeInner, leftEyeTop, leftEyeBottom);
          const rightEar = getEyeAspectRatio(rightEyeOuter, rightEyeInner, rightEyeTop, rightEyeBottom);
          const averageEar = (leftEar + rightEar) / 2;
          const eyeWidthRatio = Math.max(leftEar, rightEar) / Math.max(0.0001, Math.min(leftEar, rightEar));
          const mouthWidthRatio = distance(mouthLeft, mouthRight) / Math.max(0.0001, bounds.width);
          const mouthOpenRatio = distance(upperLip, lowerLip) / Math.max(0.0001, bounds.height);
          const lightingCanvas = lightingCanvasRef.current ?? document.createElement("canvas");
          lightingCanvasRef.current = lightingCanvas;
          const lighting = getFrameLighting(video, lightingCanvas);
          const occlusionFrame =
            centered &&
            properSize &&
            (eyeWidthRatio > 2.25 || averageEar < 0.055 || mouthWidthRatio < 0.1 || mouthOpenRatio < 0.0025);

          if (occlusionFrame) {
            occlusionCounterRef.current += 1;
          } else {
            occlusionCounterRef.current = Math.max(0, occlusionCounterRef.current - 2);
          }

          const occlusionClear = occlusionCounterRef.current < 40;

          if (averageEar > 0.21) {
            challengeRef.current.eyesWereOpen = true;
          }
          if (challengeRef.current.eyesWereOpen && averageEar < 0.195) {
            challengeRef.current.blinkDetected = true;
          }
          challengeRef.current.blinkProgress = Math.max(
            challengeRef.current.blinkProgress,
            scoreBlinkProgress(averageEar, challengeRef.current.blinkDetected, challengeRef.current.eyesWereOpen),
          );

          const next: FaceQualityState = {
            detected: true,
            singleFace,
            centered,
            properSize,
            lightingGood: lighting.good,
            frontFacing,
            rightAngle: challengeRef.current.rightAngle,
            leftAngle: challengeRef.current.leftAngle,
            blinkDetected: challengeRef.current.blinkDetected,
            occlusionClear,
            score: 0,
            readyToRecord: false,
            message: "정면, 좌우 고개 움직임, 눈 깜빡임을 실제로 확인 중입니다.",
          };

          const scoreParts = [
            scoreBoolean(next.detected),
            scoreBoolean(next.singleFace),
            (scoreCentered(bounds.centerX, 0.5, 0.18) + scoreCentered(bounds.centerY, 0.52, 0.2)) / 2,
            (scoreRange(bounds.width, 0.22, 0.58, 0.12) + scoreRange(bounds.height, 0.32, 0.78, 0.14)) / 2,
            scoreLighting(lighting.brightness, lighting.contrast),
            challengeRef.current.frontFacingSeen ? 1 : challengeRef.current.frontFacingProgress,
            challengeRef.current.rightProgress,
            challengeRef.current.leftProgress,
            challengeRef.current.blinkProgress,
            scoreOcclusion(occlusionCounterRef.current),
          ];
          setCheckProgress({
            detected: 1,
            singleFace: scoreBoolean(next.singleFace),
            centered: (scoreCentered(bounds.centerX, 0.5, 0.18) + scoreCentered(bounds.centerY, 0.52, 0.2)) / 2,
            properSize: (scoreRange(bounds.width, 0.22, 0.58, 0.12) + scoreRange(bounds.height, 0.32, 0.78, 0.14)) / 2,
            lightingGood: scoreLighting(lighting.brightness, lighting.contrast),
            occlusionClear: scoreOcclusion(occlusionCounterRef.current),
            frontFacing: challengeRef.current.frontFacingSeen ? 1 : challengeRef.current.frontFacingProgress,
            rightAngle: challengeRef.current.rightProgress,
            leftAngle: challengeRef.current.leftProgress,
            blinkDetected: challengeRef.current.blinkProgress,
          });
          next.score = Math.round((scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length) * 10000) / 100;
          next.readyToRecord = next.detected && next.singleFace && next.score >= AUTO_CAPTURE_SCORE_THRESHOLD;

          if (!next.singleFace) {
            next.message = "한 명만 화면에 나오도록 맞춰 주세요.";
          } else if (!next.centered) {
            next.message = "얼굴을 화면 중앙으로 맞춰 주세요.";
          } else if (!next.properSize) {
            next.message = "얼굴이 너무 가깝거나 멉니다. 적정 거리로 맞춰 주세요.";
          } else if (!next.lightingGood) {
            next.message = "조명이 너무 어둡거나 밝습니다. 얼굴이 고르게 보이도록 조명을 맞춰 주세요.";
          } else if (!next.frontFacing) {
            next.message = "먼저 정면을 바라봐 주세요.";
          } else if (!next.rightAngle) {
            next.message = "고개를 오른쪽으로 돌려 실제 움직임을 보여 주세요.";
          } else if (!next.leftAngle) {
            next.message = "고개를 왼쪽으로 돌려 실제 움직임을 보여 주세요.";
          } else if (!next.blinkDetected) {
            next.message = "마지막으로 눈을 한 번 깜빡여 주세요.";
          } else if (next.score < AUTO_CAPTURE_SCORE_THRESHOLD) {
            next.message = `자동촬영 가능 점수 ${AUTO_CAPTURE_SCORE_THRESHOLD.toFixed(2)}점 이상이 필요합니다.`;
          } else if (next.readyToRecord) {
            next.message = "자동촬영이 가능한 상태입니다.";
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
      lightingCanvasRef.current = null;
      occlusionCounterRef.current = 0;
    };
  }, [onReadyStateChange, videoRef]);

  const checks = useMemo<[string, boolean, number][]>( 
    () => [
      ["얼굴 감지", state.detected, checkProgress.detected],
      ["한 명만 인식", state.singleFace, checkProgress.singleFace],
      ["중앙 정렬", state.centered, checkProgress.centered],
      ["적정 크기", state.properSize, checkProgress.properSize],
      ["조명 적정", state.lightingGood, checkProgress.lightingGood],
      ["얼굴 가림 없음", state.occlusionClear, checkProgress.occlusionClear],
      ["정면", state.frontFacing, checkProgress.frontFacing],
      ["오른쪽 회전", state.rightAngle, checkProgress.rightAngle],
      ["왼쪽 회전", state.leftAngle, checkProgress.leftAngle],
      ["눈 깜빡임", state.blinkDetected, checkProgress.blinkDetected],
    ],
    [checkProgress, state],
  );

  if (!modelReady) {
    return <LoadingState text="MediaPipe 얼굴 품질 검사를 준비 중입니다." />;
  }

  return (
    <div className="panel">
      <div className="score">{state.score.toFixed(2)}점</div>
      <p className="helper-text">
        {modelFailed
          ? "라이브니스 검사를 완료하지 못했습니다."
          : state.readyToRecord
            ? "실제 얼굴 움직임 확인 완료"
            : "사진이 아니라 실제 얼굴 움직임이 필요합니다."}
      </p>
      <div className="inline-meta">
        {checks.map(([label, ok, progress]) => (
          <Badge key={label} tone={ok ? "success" : "warning"} progress={progress}>
            {label}
          </Badge>
        ))}
      </div>
      <p className="helper-text">{state.message}</p>
      <p className="helper-text">
        안경, 선글라스, 마스크, 모자, 얼굴을 가리는 머리카락 같은 악세서리는 벗거나 정리한 뒤 촬영해 주세요.
      </p>
    </div>
  );
}
