"use client";

import { useEffect, useRef, useState } from "react";

type LandmarkPoint = {
  x: number;
  y: number;
};

const TFLITE_INFO_LOG = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

function isIgnorableTfliteInfoError(error: unknown) {
  return error instanceof Error && error.message.includes(TFLITE_INFO_LOG);
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
    if (isIgnorableTfliteInfoError(error)) {
      return null;
    }
    throw error;
  } finally {
    console.error = originalConsoleError;
  }
}

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
  149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];
const LEFT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52];
const RIGHT_EYEBROW = [336, 296, 334, 293, 300, 285, 295, 282];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LEFT_IRIS = [468, 469, 470, 471, 472, 468];
const RIGHT_IRIS = [473, 474, 475, 476, 477, 473];
const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4];
const NOSE_BASE = [129, 98, 97, 2, 326, 327, 358];
const NOSE_WINGS = [49, 64, 98, 2, 327, 294, 279];
const OUTER_LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78];
const LEFT_CHEEK = [205, 50, 187, 147, 177];
const RIGHT_CHEEK = [425, 280, 411, 376, 401];

const LEFT_EYE_FEATURE_POINTS = [33, 133, 159, 145];
const RIGHT_EYE_FEATURE_POINTS = [362, 263, 386, 374];
const LIP_FEATURE_POINTS = [61, 291, 13, 14, 78, 308, 17];
const FEATURE_POINTS = [
  10,
  70,
  300,
  ...LEFT_EYE_FEATURE_POINTS,
  ...RIGHT_EYE_FEATURE_POINTS,
  168,
  4,
  98,
  327,
  205,
  425,
  ...LIP_FEATURE_POINTS,
  152,
];

const FEATURE_LINKS: [number, number][] = [
  [10, 70],
  [10, 300],
  [70, 33],
  [300, 263],
  [33, 159],
  [159, 133],
  [133, 145],
  [145, 33],
  [362, 386],
  [386, 263],
  [263, 374],
  [374, 362],
  [33, 168],
  [263, 168],
  [33, 468],
  [263, 473],
  [468, 4],
  [473, 4],
  [168, 4],
  [4, 98],
  [4, 327],
  [98, 205],
  [327, 425],
  [205, 61],
  [425, 291],
  [61, 13],
  [291, 13],
  [61, 14],
  [291, 14],
  [13, 78],
  [14, 78],
  [13, 308],
  [14, 308],
  [78, 152],
  [308, 152],
  [205, 152],
  [425, 152],
  [98, 61],
  [327, 291],
];

const EYE_FEATURE_LINKS = new Set([
  "33-159",
  "159-133",
  "133-145",
  "145-33",
  "362-386",
  "386-263",
  "263-374",
  "374-362",
]);

export type FaceFeatureMetrics = {
  pointValues: number[];
  lineValues: number[];
  pointTotal: number;
  lineTotal: number;
  total: number;
};

function getFaceBounds(landmarks: LandmarkPoint[]) {
  const xs = FACE_OVAL.map((index) => landmarks[index]?.x).filter((value): value is number => typeof value === "number");
  const ys = FACE_OVAL.map((index) => landmarks[index]?.y).filter((value): value is number => typeof value === "number");
  if (!xs.length || !ys.length) {
    return null;
  }

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
  };
}

function buildFaceFeatureMetrics(landmarks: LandmarkPoint[]): FaceFeatureMetrics {
  const bounds = getFaceBounds(landmarks);
  if (!bounds) {
    return { pointValues: [], lineValues: [], pointTotal: 0, lineTotal: 0, total: 0 };
  }

  const pointValues = FEATURE_POINTS.map((pointId) => {
    const point = landmarks[pointId];
    if (!point) return 0;
    const nx = (point.x - bounds.minX) / bounds.width;
    const ny = (point.y - bounds.minY) / bounds.height;
    return Math.round(nx * 100 + ny * 100);
  });

  const lineValues = FEATURE_LINKS.map(([startId, endId]) => {
    const start = landmarks[startId];
    const end = landmarks[endId];
    if (!start || !end) return 0;
    const dx = (end.x - start.x) / bounds.width;
    const dy = (end.y - start.y) / bounds.height;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return Math.round(distance * 1000);
  });

  const pointTotal = pointValues.reduce((sum, value) => sum + value, 0);
  const lineTotal = lineValues.reduce((sum, value) => sum + value, 0);

  return {
    pointValues,
    lineValues,
    pointTotal,
    lineTotal,
    total: pointTotal + lineTotal,
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

  return {
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  };
}

function getFaceFit(landmarks: LandmarkPoint[]) {
  const xs = FACE_OVAL.map((index) => landmarks[index]?.x).filter((value): value is number => typeof value === "number");
  const ys = FACE_OVAL.map((index) => landmarks[index]?.y).filter((value): value is number => typeof value === "number");
  if (!xs.length || !ys.length) return false;

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[1];

  if (!leftEye || !rightEye || !noseTip) return false;

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const yawOffset = Math.abs(noseTip.x - eyeCenterX);
  const centered = Math.abs(centerX - 0.5) < 0.08 && Math.abs(centerY - 0.53) < 0.1;
  const properSize = faceWidth > 0.28 && faceWidth < 0.5 && faceHeight > 0.4 && faceHeight < 0.72;
  const frontEnough = yawOffset < 0.045;

  return centered && properSize && frontEnough;
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ready: boolean,
) {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  const lineColor = ready ? "rgba(187, 247, 208, 0.76)" : "rgba(248, 250, 252, 0.82)";
  const glowColor = ready ? "rgba(110, 231, 183, 0.16)" : "rgba(255, 255, 255, 0.12)";
  const pointColor = ready ? "rgba(236, 253, 245, 0.96)" : "rgba(255, 255, 255, 0.98)";

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.15;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = ready ? 6 : 4;

  for (const [startIndex, endIndex] of FEATURE_LINKS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end) continue;
    const isEyeLink = EYE_FEATURE_LINKS.has(`${startIndex}-${endIndex}`);
    const a = mapPoint(start, video, canvas);
    const b = mapPoint(end, video, canvas);
    ctx.strokeStyle = isEyeLink
      ? ready
        ? "rgba(220, 252, 231, 0.95)"
        : "rgba(255, 255, 255, 0.98)"
      : lineColor;
    ctx.lineWidth = isEyeLink ? 1.7 : 1.15;
    ctx.shadowBlur = isEyeLink ? (ready ? 8 : 6) : ready ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = ready ? 8 : 6;
  ctx.fillStyle = pointColor;
  for (const index of FEATURE_POINTS) {
    const point = landmarks[index];
    if (!point) continue;
    const mapped = mapPoint(point, video, canvas);
    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, ready ? 2.6 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

export function FaceLandmarkOverlay({
  videoRef,
  onMetricsChange,
  onMetricsStatusChange,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onMetricsChange?: (metrics: FaceFeatureMetrics) => void;
  onMetricsStatusChange?: (status: "idle" | "sampling" | "locked") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const readyRef = useRef(false);
  const metricsBufferRef = useRef<FaceFeatureMetrics[]>([]);
  const metricsLockedRef = useRef(false);
  const metricsStartRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    const originalConsoleError = console.error;
    let faceLandmarker: {
      detectForVideo: (video: HTMLVideoElement, timestamp: number) => { faceLandmarks?: LandmarkPoint[][] };
      close?: () => void;
    } | null = null;

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

        const render = () => {
          if (cancelled) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (!video || !canvas) {
            rafId = requestAnimationFrame(render);
            return;
          }

          resizeCanvas(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            rafId = requestAnimationFrame(render);
            return;
          }

          if (video.readyState >= 2) {
            const result = withSuppressedTfliteInfo(
              () => faceLandmarker?.detectForVideo(video, performance.now()),
            );
            const landmarks = result?.faceLandmarks?.[0];

            if (landmarks) {
              const nextReady = getFaceFit(landmarks);
              if (nextReady !== readyRef.current) {
                readyRef.current = nextReady;
                setReady(nextReady);
              }
              const nextMetrics = buildFaceFeatureMetrics(landmarks);
              if (metricsStartRef.current === null) {
                metricsStartRef.current = performance.now();
                onMetricsStatusChange?.("sampling");
              }

              if (!metricsLockedRef.current) {
                metricsBufferRef.current.push(nextMetrics);
                const elapsed = performance.now() - metricsStartRef.current;
                if (elapsed >= 1500) {
                  const samples = metricsBufferRef.current;
                  const averageMetrics: FaceFeatureMetrics = {
                    pointValues: nextMetrics.pointValues.map((_, index) =>
                      Math.round(samples.reduce((sum, sample) => sum + (sample.pointValues[index] ?? 0), 0) / samples.length),
                    ),
                    lineValues: nextMetrics.lineValues.map((_, index) =>
                      Math.round(samples.reduce((sum, sample) => sum + (sample.lineValues[index] ?? 0), 0) / samples.length),
                    ),
                    pointTotal: Math.round(samples.reduce((sum, sample) => sum + sample.pointTotal, 0) / samples.length),
                    lineTotal: Math.round(samples.reduce((sum, sample) => sum + sample.lineTotal, 0) / samples.length),
                    total: Math.round(samples.reduce((sum, sample) => sum + sample.total, 0) / samples.length),
                  };
                  metricsLockedRef.current = true;
                  onMetricsStatusChange?.("locked");
                  onMetricsChange?.(averageMetrics);
                } else {
                  onMetricsChange?.(nextMetrics);
                }
              }
              drawConnections(ctx, landmarks, video, canvas, nextReady);
            } else {
              if (readyRef.current) {
                readyRef.current = false;
                setReady(false);
              }
              metricsBufferRef.current = [];
              metricsLockedRef.current = false;
              metricsStartRef.current = null;
              onMetricsStatusChange?.("idle");
              onMetricsChange?.({
                pointValues: [],
                lineValues: [],
                pointTotal: 0,
                lineTotal: 0,
                total: 0,
              });
              ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            }
          } else {
            if (readyRef.current) {
              readyRef.current = false;
              setReady(false);
            }
            metricsBufferRef.current = [];
            metricsLockedRef.current = false;
            metricsStartRef.current = null;
            onMetricsStatusChange?.("idle");
            onMetricsChange?.({
              pointValues: [],
              lineValues: [],
              pointTotal: 0,
              lineTotal: 0,
              total: 0,
            });
            ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          }

          rafId = requestAnimationFrame(render);
        };

        rafId = requestAnimationFrame(render);
      } catch {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        ctx?.clearRect(0, 0, canvas?.clientWidth ?? 0, canvas?.clientHeight ?? 0);
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      console.error = originalConsoleError;
      faceLandmarker = null;
      metricsBufferRef.current = [];
      metricsLockedRef.current = false;
      metricsStartRef.current = null;
      onMetricsStatusChange?.("idle");
    };
  }, [onMetricsChange, onMetricsStatusChange, videoRef]);

  return (
    <div className="face-landmark-layer" data-ready={ready ? "true" : "false"} aria-hidden="true">
      <canvas ref={canvasRef} className="face-landmark-overlay" />
      <div className="face-hud-scan" />
    </div>
  );
}
