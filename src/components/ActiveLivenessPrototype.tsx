"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

type LandmarkPoint = {
  x: number;
  y: number;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type LivenessStepId = "frontBlink" | "right" | "left" | "down" | "up" | "complete";
type ChallengeStepId = Exclude<LivenessStepId, "complete">;
type CameraState = "idle" | "requesting" | "running" | "failed";
type ModelState = "idle" | "loading" | "ready" | "failed";

type LivenessMetrics = {
  detected: boolean;
  singleFace: boolean;
  centered: boolean;
  properSize: boolean;
  lightingGood: boolean;
  occlusionClear: boolean;
  yawRatio: number;
  pitchRatio: number;
  faceWidth: number;
  faceHeight: number;
  brightness: number;
  contrast: number;
  averageEar: number;
  score: number;
};

type ChallengeState = {
  frontBlink: boolean;
  right: boolean;
  left: boolean;
  down: boolean;
  up: boolean;
};

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
const TFLITE_INFO_LOG = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

const USER_YAW_TARGET = 0.105;
const PITCH_DELTA_TARGET = 0.055;
const EYES_OPEN_EAR = 0.21;
const EYES_CLOSED_EAR = 0.195;
const FRONT_HOLD_MS = 1500;
const CHALLENGE_HOLD_MS = 750;
const SCORE_PASS_THRESHOLD = 82;

const initialMetrics: LivenessMetrics = {
  detected: false,
  singleFace: false,
  centered: false,
  properSize: false,
  lightingGood: false,
  occlusionClear: false,
  yawRatio: 0,
  pitchRatio: 0,
  faceWidth: 0,
  faceHeight: 0,
  brightness: 0,
  contrast: 0,
  averageEar: 0,
  score: 0,
};

const steps: { id: LivenessStepId; label: string; shortLabel: string }[] = [
  { id: "frontBlink", label: "정면 + 눈깜빡임", shortLabel: "정면" },
  { id: "right", label: "오른쪽 50~60도", shortLabel: "오른쪽" },
  { id: "left", label: "왼쪽 50~60도", shortLabel: "왼쪽" },
  { id: "down", label: "고개 숙이기", shortLabel: "숙이기" },
  { id: "up", label: "고개 들기", shortLabel: "들기" },
  { id: "complete", label: "판정 완료", shortLabel: "완료" },
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

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
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function scoreRange(value: number, min: number, max: number, softMargin: number) {
  if (value >= min && value <= max) return 1;
  if (value < min) return clamp01(1 - (min - value) / softMargin);
  return clamp01(1 - (value - max) / softMargin);
}

function getFaceBounds(landmarks: LandmarkPoint[]): Bounds | null {
  const xs = FACE_OVAL.map((index) => landmarks[index]?.x).filter((value): value is number => typeof value === "number");
  const ys = FACE_OVAL.map((index) => landmarks[index]?.y).filter((value): value is number => typeof value === "number");
  if (!xs.length || !ys.length) return null;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function eyeAspectRatio(outer: LandmarkPoint, inner: LandmarkPoint, top: LandmarkPoint, bottom: LandmarkPoint) {
  const eyeWidth = distance(outer, inner);
  if (eyeWidth <= 0.0001) return 0;
  return distance(top, bottom) / eyeWidth;
}

function getLighting(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = 36;
  const height = 24;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { brightness: 0, contrast: 0, good: false };

  ctx.drawImage(video, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const luminances: number[] = [];
  let total = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    total += luminance;
    luminances.push(luminance);
  }

  const brightness = total / Math.max(1, luminances.length);
  const variance =
    luminances.reduce((sum, luminance) => sum + Math.pow(luminance - brightness, 2), 0) / Math.max(1, luminances.length);
  const contrast = Math.sqrt(variance);

  return {
    brightness,
    contrast,
    good: brightness >= 55 && brightness <= 218 && contrast >= 15,
  };
}

function mapPoint(point: LandmarkPoint, video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / height;

  let renderedWidth = width;
  let renderedHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceAspect > targetAspect) {
    renderedHeight = height;
    renderedWidth = renderedHeight * sourceAspect;
    offsetX = (width - renderedWidth) / 2;
  } else {
    renderedWidth = width;
    renderedHeight = renderedWidth / sourceAspect;
    offsetY = (height - renderedHeight) / 2;
  }

  const rawX = offsetX + point.x * renderedWidth;

  return {
    x: width - rawX,
    y: offsetY + point.y * renderedHeight,
  };
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[] | null,
  metrics: LivenessMetrics,
  activeStep: LivenessStepId,
) {
  resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  const cx = canvas.clientWidth / 2;
  const cy = canvas.clientHeight * 0.47;
  const rx = canvas.clientWidth * 0.25;
  const ry = canvas.clientHeight * 0.31;
  ctx.lineWidth = 2;
  ctx.strokeStyle = metrics.score >= SCORE_PASS_THRESHOLD ? "rgba(31, 122, 84, 0.96)" : "rgba(255, 255, 255, 0.82)";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!landmarks) return;

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.strokeStyle = metrics.score >= SCORE_PASS_THRESHOLD ? "rgba(94, 234, 212, 0.85)" : "rgba(147, 197, 253, 0.72)";
  ctx.lineWidth = 1;

  for (let index = 0; index < FACE_OVAL.length - 1; index += 1) {
    const start = landmarks[FACE_OVAL[index]];
    const end = landmarks[FACE_OVAL[index + 1]];
    if (!start || !end) continue;
    const a = mapPoint(start, video, canvas);
    const b = mapPoint(end, video, canvas);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const points = [LEFT_EYE_OUTER, LEFT_EYE_INNER, RIGHT_EYE_INNER, RIGHT_EYE_OUTER, NOSE_TIP];
  for (const pointId of points) {
    const point = landmarks[pointId];
    if (!point) continue;
    const mapped = mapPoint(point, video, canvas);
    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (activeStep === "right" || activeStep === "left" || activeStep === "down" || activeStep === "up") {
    const isHorizontal = activeStep === "right" || activeStep === "left";
    const arrowStartX = activeStep === "right" ? cx - 70 : activeStep === "left" ? cx + 70 : cx;
    const arrowEndX = activeStep === "right" ? cx + 70 : activeStep === "left" ? cx - 70 : cx;
    const arrowStartY = isHorizontal ? canvas.clientHeight * 0.18 : activeStep === "down" ? canvas.clientHeight * 0.12 : canvas.clientHeight * 0.25;
    const arrowEndY = isHorizontal ? canvas.clientHeight * 0.18 : activeStep === "down" ? canvas.clientHeight * 0.25 : canvas.clientHeight * 0.12;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(arrowStartX, arrowStartY);
    ctx.lineTo(arrowEndX, arrowEndY);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function stepIndexOf(stepId: LivenessStepId) {
  return steps.findIndex((step) => step.id === stepId);
}

function getQualityBlockMessage(metrics: LivenessMetrics) {
  if (!metrics.detected) {
    if (metrics.brightness > 0 && metrics.brightness < 45) {
      return "어두운 환경에서는 얼굴 인식이 어렵습니다. 조명을 켜고 얼굴을 밝게 비춰 주세요.";
    }
    if (metrics.brightness > 228) {
      return "빛이 너무 강하거나 역광입니다. 얼굴이 하얗게 날아가지 않도록 방향을 조정해 주세요.";
    }
    if (metrics.contrast > 0 && metrics.contrast < 10) {
      return "얼굴과 배경 구분이 약합니다. 조명 방향을 바꾸거나 더 밝은 곳에서 시도해 주세요.";
    }
    return "얼굴이 화면에 보이지 않습니다. 얼굴 전체가 안내선 안에 들어오게 맞춰 주세요.";
  }

  if (!metrics.singleFace) {
    return "두 명 이상이 화면에 잡혔습니다. 인증 대상 한 명만 화면에 나오게 해 주세요.";
  }

  if (!metrics.properSize) {
    if (metrics.faceWidth < 0.24 || metrics.faceHeight < 0.32) {
      return "얼굴이 너무 작게 보입니다. 카메라에 조금 더 가까이 다가와 주세요.";
    }
    return "얼굴이 너무 크게 보입니다. 카메라에서 조금 더 떨어져 주세요.";
  }

  if (!metrics.centered) {
    return "얼굴이 프레임 중앙에서 벗어났습니다. 화면 중앙에 얼굴을 맞춰 주세요.";
  }

  if (!metrics.lightingGood) {
    if (metrics.brightness < 55) {
      return "조명이 어두워 얼굴 특징점을 읽기 어렵습니다. 불을 켜거나 밝은 곳으로 이동해 주세요.";
    }
    if (metrics.brightness > 218) {
      return "조명이 너무 강합니다. 역광이나 직사광선을 피해서 얼굴 윤곽이 보이게 해 주세요.";
    }
    return "조명 대비가 낮아 얼굴 윤곽이 흐립니다. 얼굴 쪽 조명을 고르게 맞춰 주세요.";
  }

  if (!metrics.occlusionClear) {
    return "눈, 코, 입 주변이 가려져 인식이 어렵습니다. 일반 안경은 허용하지만 눈 반사나 선글라스는 피해주세요.";
  }

  if (metrics.score < SCORE_PASS_THRESHOLD) {
    return `품질 점수 ${SCORE_PASS_THRESHOLD}점 이상이 필요합니다. 얼굴 위치와 조명을 조금 더 맞춰 주세요.`;
  }

  return "";
}

export function ActiveLivenessPrototype() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeStepRef = useRef<LivenessStepId>("frontBlink");
  const challengeRef = useRef<ChallengeState>({
    frontBlink: false,
    right: false,
    left: false,
    down: false,
    up: false,
  });
  const holdStartRef = useRef<Record<ChallengeStepId, number | null>>({
    frontBlink: null,
    right: null,
    left: null,
    down: null,
    up: null,
  });
  const eyesWereOpenRef = useRef(false);
  const blinkSeenRef = useRef(false);
  const baselinePitchRef = useRef<number | null>(null);
  const downPitchSignRef = useRef<1 | -1 | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [activeStep, setActiveStep] = useState<LivenessStepId>("frontBlink");
  const [metrics, setMetrics] = useState<LivenessMetrics>(initialMetrics);
  const [challenge, setChallenge] = useState<ChallengeState>({
    frontBlink: false,
    right: false,
    left: false,
    down: false,
    up: false,
  });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const moveToStep = (step: LivenessStepId) => {
    activeStepRef.current = step;
    setActiveStep(step);
  };

  const setChallengeState = (next: ChallengeState) => {
    challengeRef.current = next;
    setChallenge(next);
  };

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopCamera = () => {
    stopLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState("idle");
  };

  const resetHolds = () => {
    holdStartRef.current = {
      frontBlink: null,
      right: null,
      left: null,
      down: null,
      up: null,
    };
  };

  const resetSession = () => {
    resetHolds();
    eyesWereOpenRef.current = false;
    blinkSeenRef.current = false;
    baselinePitchRef.current = null;
    downPitchSignRef.current = null;
    startedAtRef.current = performance.now();
    moveToStep("frontBlink");
    setElapsedMs(0);
    setMetrics(initialMetrics);
    setChallengeState({ frontBlink: false, right: false, left: false, down: false, up: false });
    setErrorMessage("");
  };

  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  const loadModel = async () => {
    if (landmarkerRef.current) return landmarkerRef.current;

    setModelState("loading");
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const resolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );
      const landmarker = await vision.FaceLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 2,
      });
      landmarkerRef.current = landmarker;
      setModelState("ready");
      return landmarker;
    } catch (error) {
      setModelState("failed");
      throw error;
    }
  };

  const startCamera = async () => {
    setErrorMessage("");
    resetSession();
    setCameraState("requesting");

    try {
      const [landmarker, stream] = await Promise.all([
        loadModel(),
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        }),
      ]);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("running");
      startedAtRef.current = performance.now();
      runDetection(landmarker);
    } catch {
      setErrorMessage("카메라 또는 라이브니스 모델을 시작하지 못했습니다. 카메라 권한과 네트워크 연결을 확인해 주세요.");
      stopCamera();
      setCameraState("failed");
    }
  };

  const buildNoFaceMetrics = (video: HTMLVideoElement): LivenessMetrics => {
    const lightingCanvas = lightingCanvasRef.current ?? document.createElement("canvas");
    lightingCanvasRef.current = lightingCanvas;
    const lighting = getLighting(video, lightingCanvas);

    return {
      ...initialMetrics,
      brightness: lighting.brightness,
      contrast: lighting.contrast,
      lightingGood: lighting.good,
    };
  };

  const runDetection = (landmarker: FaceLandmarker) => {
    stopLoop();

    const tick = () => {
      const video = videoRef.current;
      const canvas = overlayRef.current;

      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const result = withSuppressedTfliteInfo(() => landmarker.detectForVideo(video, performance.now()));
      const faces = result?.faceLandmarks ?? [];
      const landmarks = faces[0] ?? null;

      if (startedAtRef.current) {
        setElapsedMs(performance.now() - startedAtRef.current);
      }

      if (!landmarks) {
        const currentStep = activeStepRef.current;
        if (currentStep !== "complete") {
          holdStartRef.current[currentStep] = null;
        }
        if (currentStep === "frontBlink") {
          eyesWereOpenRef.current = false;
          blinkSeenRef.current = false;
        }
        const noFaceMetrics = buildNoFaceMetrics(video);
        setMetrics(noFaceMetrics);
        drawOverlay(canvas, video, null, noFaceMetrics, currentStep);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const nextMetrics = buildMetrics(video, landmarks, faces.length);
      setMetrics(nextMetrics);
      const currentStep = activeStepRef.current;
      drawOverlay(canvas, video, landmarks, nextMetrics, currentStep);

      const now = performance.now();
      let nextChallenge = challengeRef.current;
      let changed = false;
      const qualityReady = nextMetrics.score >= SCORE_PASS_THRESHOLD;
      const baselinePitch = baselinePitchRef.current ?? nextMetrics.pitchRatio;
      const pitchDelta = nextMetrics.pitchRatio - baselinePitch;

      const markPassed = (key: keyof ChallengeState) => {
        if (nextChallenge[key]) return;
        nextChallenge = { ...nextChallenge, [key]: true };
        changed = true;
      };

      if (currentStep === "frontBlink") {
        if (nextMetrics.averageEar > EYES_OPEN_EAR) {
          eyesWereOpenRef.current = true;
        }
        if (eyesWereOpenRef.current && nextMetrics.averageEar < EYES_CLOSED_EAR) {
          blinkSeenRef.current = true;
        }

        if (qualityReady) {
          holdStartRef.current.frontBlink ??= now;
        } else {
          holdStartRef.current.frontBlink = null;
        }

        const frontHeld =
          holdStartRef.current.frontBlink !== null && now - holdStartRef.current.frontBlink >= FRONT_HOLD_MS;
        if (frontHeld && blinkSeenRef.current) {
          baselinePitchRef.current = nextMetrics.pitchRatio;
          markPassed("frontBlink");
          moveToStep("right");
        }
      }

      if (currentStep === "right" && qualityReady && nextMetrics.yawRatio >= USER_YAW_TARGET) {
        holdStartRef.current.right ??= now;
        if (now - holdStartRef.current.right >= CHALLENGE_HOLD_MS) {
          markPassed("right");
          moveToStep("left");
        }
      } else if (currentStep === "right") {
        holdStartRef.current.right = null;
      }

      if (currentStep === "left" && qualityReady && nextMetrics.yawRatio <= -USER_YAW_TARGET) {
        holdStartRef.current.left ??= now;
        if (now - holdStartRef.current.left >= CHALLENGE_HOLD_MS) {
          markPassed("left");
          moveToStep("down");
        }
      } else if (currentStep === "left") {
        holdStartRef.current.left = null;
      }

      if (currentStep === "down" && qualityReady && Math.abs(pitchDelta) >= PITCH_DELTA_TARGET) {
        holdStartRef.current.down ??= now;
        if (now - holdStartRef.current.down >= CHALLENGE_HOLD_MS) {
          downPitchSignRef.current = pitchDelta >= 0 ? 1 : -1;
          markPassed("down");
          moveToStep("up");
        }
      } else if (currentStep === "down") {
        holdStartRef.current.down = null;
      }

      const downPitchSign = downPitchSignRef.current ?? 1;
      if (currentStep === "up" && qualityReady && downPitchSign * pitchDelta <= -PITCH_DELTA_TARGET) {
        holdStartRef.current.up ??= now;
        if (now - holdStartRef.current.up >= CHALLENGE_HOLD_MS) {
          markPassed("up");
          moveToStep("complete");
        }
      } else if (currentStep === "up") {
        holdStartRef.current.up = null;
      }

      if (changed) {
        setChallengeState(nextChallenge);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  function buildMetrics(video: HTMLVideoElement, landmarks: LandmarkPoint[], faceCount: number): LivenessMetrics {
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
      return initialMetrics;
    }

    const eyeCenterX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const leftEyeY = (leftEyeOuter.y + leftEyeInner.y) / 2;
    const rightEyeY = (rightEyeOuter.y + rightEyeInner.y) / 2;
    const eyeCenterY = (leftEyeY + rightEyeY) / 2;
    const mouthCenterY = (mouthLeft.y + mouthRight.y) / 2;
    const rawYawRatio = (noseTip.x - eyeCenterX) / Math.max(0.0001, bounds.width);
    const yawRatio = -rawYawRatio;
    const pitchRatio = (noseTip.y - eyeCenterY) / Math.max(0.0001, mouthCenterY - eyeCenterY);
    const leftEar = eyeAspectRatio(leftEyeOuter, leftEyeInner, leftEyeTop, leftEyeBottom);
    const rightEar = eyeAspectRatio(rightEyeOuter, rightEyeInner, rightEyeTop, rightEyeBottom);
    const averageEar = (leftEar + rightEar) / 2;
    const eyeWidthRatio = Math.max(leftEar, rightEar) / Math.max(0.0001, Math.min(leftEar, rightEar));
    const mouthWidthRatio = distance(mouthLeft, mouthRight) / Math.max(0.0001, bounds.width);
    const mouthOpenRatio = distance(upperLip, lowerLip) / Math.max(0.0001, bounds.height);
    const lightingCanvas = lightingCanvasRef.current ?? document.createElement("canvas");
    lightingCanvasRef.current = lightingCanvas;
    const lighting = getLighting(video, lightingCanvas);
    const centered = Math.abs(bounds.centerX - 0.5) < 0.12 && Math.abs(bounds.centerY - 0.51) < 0.15;
    const properSize = bounds.width > 0.24 && bounds.width < 0.62 && bounds.height > 0.32 && bounds.height < 0.82;
    const singleFace = faceCount === 1;
    const occlusionClear = !(eyeWidthRatio > 2.35 || averageEar < 0.052 || mouthWidthRatio < 0.1 || mouthOpenRatio < 0.0025);

    const scoreParts = [
      1,
      singleFace ? 1 : 0,
      (scoreRange(bounds.centerX, 0.45, 0.55, 0.16) + scoreRange(bounds.centerY, 0.43, 0.6, 0.18)) / 2,
      (scoreRange(bounds.width, 0.28, 0.58, 0.12) + scoreRange(bounds.height, 0.38, 0.78, 0.16)) / 2,
      (scoreRange(lighting.brightness, 62, 208, 42) + scoreRange(lighting.contrast, 18, 96, 18)) / 2,
      occlusionClear ? 1 : 0,
    ];

    return {
      detected: true,
      singleFace,
      centered,
      properSize,
      lightingGood: lighting.good,
      occlusionClear,
      yawRatio,
      pitchRatio,
      faceWidth: bounds.width,
      faceHeight: bounds.height,
      brightness: lighting.brightness,
      contrast: lighting.contrast,
      averageEar,
      score: Math.round((scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length) * 100),
    };
  }

  const activeStepInfo = steps.find((step) => step.id === activeStep) ?? steps[0];
  const currentStepIndex = stepIndexOf(activeStep);
  const completedCount =
    Number(challenge.frontBlink) + Number(challenge.right) + Number(challenge.left) + Number(challenge.down) + Number(challenge.up);
  const passReady = activeStep === "complete";
  const pitchDelta = baselinePitchRef.current === null ? 0 : metrics.pitchRatio - baselinePitchRef.current;
  const yawApproxDegrees = Math.round(Math.abs(metrics.yawRatio) * 500);
  const pitchApprox = Math.round(pitchDelta * 1000);

  const primaryInstruction = useMemo(() => {
    if (cameraState !== "running") return "카메라를 시작하세요.";
    const qualityBlockMessage = getQualityBlockMessage(metrics);
    if (qualityBlockMessage) return qualityBlockMessage;
    if (activeStep === "frontBlink") return "정면을 1.5초 유지하고 눈을 한 번 깜빡이세요.";
    if (activeStep === "right") return "고개를 오른쪽으로 크게 돌리고 0.75초 유지하세요.";
    if (activeStep === "left") return "고개를 왼쪽으로 크게 돌리고 0.75초 유지하세요.";
    if (activeStep === "down") return "턱을 아래로 당겨 고개를 숙이고 0.75초 유지하세요.";
    if (activeStep === "up") return "턱을 들어 얼굴을 위로 향하고 0.75초 유지하세요.";
    return "라이브니스 통과";
  }, [activeStep, cameraState, metrics]);

  const qualityChecks = [
    ["얼굴", metrics.detected, metrics.detected ? 1 : 0],
    ["단일 인물", metrics.singleFace, metrics.singleFace ? 1 : 0],
    ["중앙", metrics.centered, (scoreRange(metrics.faceWidth ? 0.5 + (metrics.yawRatio * metrics.faceWidth) : 0.5, 0.42, 0.58, 0.2) + (metrics.centered ? 1 : 0)) / 2],
    ["거리", metrics.properSize, (scoreRange(metrics.faceWidth, 0.28, 0.58, 0.12) + scoreRange(metrics.faceHeight, 0.38, 0.78, 0.16)) / 2],
    ["조명", metrics.lightingGood, (scoreRange(metrics.brightness, 62, 208, 42) + scoreRange(metrics.contrast, 18, 96, 18)) / 2],
    ["가림", metrics.occlusionClear, metrics.occlusionClear ? 1 : 0],
  ] as const;

  return (
    <section className="liveness-shell">
      <div className="liveness-stage">
        <div className="liveness-camera">
          <video ref={videoRef} muted playsInline autoPlay />
          <canvas ref={overlayRef} className="liveness-overlay" />
          <div className="liveness-vignette" />
          <div className="liveness-prompt">
            <span>{activeStepInfo.shortLabel}</span>
            <strong>{primaryInstruction}</strong>
          </div>
          <div className="liveness-score-ring" data-pass={passReady ? "true" : "false"}>
            <span>{passReady ? "PASS" : metrics.score}</span>
          </div>
        </div>
      </div>

      <aside className="liveness-panel">
        <div className="liveness-header">
          <div>
            <p>Active Liveness</p>
            <h1>실물 움직임 검증</h1>
          </div>
          <Badge tone={passReady ? "success" : cameraState === "running" ? "info" : "warning"}>
            {passReady ? "통과" : cameraState === "running" ? "진행 중" : "대기"}
          </Badge>
        </div>

        <div className="liveness-actions">
          <Button onClick={startCamera} disabled={cameraState === "requesting" || modelState === "loading"}>
            {cameraState === "running" ? "다시 시작" : cameraState === "requesting" ? "시작 중" : "카메라 시작"}
          </Button>
          <Button variant="secondary" onClick={resetSession} disabled={cameraState !== "running"}>
            초기화
          </Button>
          <Button variant="secondary" onClick={stopCamera} disabled={cameraState !== "running"}>
            종료
          </Button>
        </div>

        {errorMessage ? <div className="liveness-alert">{errorMessage}</div> : null}

        <div className="liveness-steps">
          {steps.map((step, index) => {
            const done =
              step.id === "complete"
                ? passReady
                : step.id === "frontBlink"
                  ? challenge.frontBlink
                  : step.id === "right"
                    ? challenge.right
                    : step.id === "left"
                      ? challenge.left
                      : step.id === "down"
                        ? challenge.down
                        : challenge.up;
            const active = index === currentStepIndex;
            return (
              <div key={step.id} className="liveness-step" data-active={active ? "true" : "false"} data-done={done ? "true" : "false"}>
                <span>{index + 1}</span>
                <strong>{step.label}</strong>
              </div>
            );
          })}
        </div>

        <div className="liveness-quality">
          <div className="liveness-quality__top">
            <strong>품질 점수</strong>
            <span>{metrics.score}/100</span>
          </div>
          <div className="liveness-meter">
            <span style={{ width: `${metrics.score}%` }} />
          </div>
          <div className="liveness-badges">
            {qualityChecks.map(([label, ok, progress]) => (
              <Badge key={label} tone={ok ? "success" : "warning"} progress={progress}>
                {label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="liveness-readout">
          <div>
            <span>yaw</span>
            <strong>{yawApproxDegrees}°</strong>
          </div>
          <div>
            <span>pitch</span>
            <strong>{pitchApprox}</strong>
          </div>
          <div>
            <span>EAR</span>
            <strong>{formatNumber(metrics.averageEar, 3)}</strong>
          </div>
          <div>
            <span>light</span>
            <strong>{Math.round(metrics.brightness)}</strong>
          </div>
        </div>

        <div className="liveness-result" data-pass={passReady ? "true" : "false"}>
          <strong>{passReady ? "검증 완료" : `${completedCount}/5 단계 완료`}</strong>
          <span>
            {passReady
              ? "정면, 눈깜빡임, 좌우 회전, 고개 숙임/들림 챌린지가 모두 통과되었습니다."
              : "각 단계에서 품질 점수 82점 이상을 유지해야 다음 동작으로 넘어갑니다."}
          </span>
        </div>
      </aside>
    </section>
  );
}
