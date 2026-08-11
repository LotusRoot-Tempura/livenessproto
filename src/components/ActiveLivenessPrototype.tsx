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
  occlusionRawClear: boolean;
  occlusionScore: number;
  landmarkJitter: number;
  eyeJitter: number;
  noseJitter: number;
  mouthJitter: number;
  jitterSpikeRatio: number;
  jitterSpikeCount: number;
  mouthJitterSpikeRatio: number;
  mouthJitterSpikeCount: number;
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

type QualityIssue = {
  key: string;
  message: string;
};

type BlinkPhase = "waitingOpen" | "waitingClosed" | "waitingReopen" | "confirmed";
type PixelFrame = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
type RegionSignal = {
  brightness: number;
  contrast: number;
  edge: number;
  saturation: number;
};
type MouthLineSignal = {
  seamDarkness: number;
  lineContrast: number;
  lineEdge: number;
  lineBrightness: number;
};
type VisualLayerId = "mesh" | "contours" | "keyPoints" | "vectors";
type VisualLayerState = Record<VisualLayerId, boolean>;
type LandmarkConnection = {
  start: number;
  end: number;
};
type LandmarkConnectionSets = {
  mesh: LandmarkConnection[];
  contours: LandmarkConnection[];
};
type NormalizedLandmarkSnapshot = Map<number, LandmarkPoint>;
type LandmarkJitterSignal = {
  global: number;
  eyes: number;
  nose: number;
  mouth: number;
  score: number;
  severe: boolean;
  snapshot: NormalizedLandmarkSnapshot;
};
type OcclusionHistoryFrame = {
  at: number;
  score: number;
  rawClear: boolean;
  severeJitter: boolean;
  jitterSpike: boolean;
  mouthJitterSpike: boolean;
  hardJitterSpike: boolean;
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
const LEFT_EYE_DENSE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE_DENSE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const NOSE_DENSE = [1, 2, 4, 5, 6, 19, 45, 48, 64, 94, 97, 98, 115, 168, 195, 197, 220, 275, 278, 294, 326, 327, 344];
const MOUTH_DENSE = [
  0, 13, 14, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181, 185, 191, 267, 269,
  270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375, 402, 405, 409, 415,
];

const USER_YAW_TARGET = 0.13;
const FRONT_YAW_LIMIT = 0.04;
const FRONT_PITCH_MIN = 0.44;
const FRONT_PITCH_MAX = 0.86;
const PITCH_DELTA_TARGET = 0.07;
const EYES_OPEN_EAR = 0.21;
const EYES_CLOSED_EAR = 0.195;
const FRONT_HOLD_MS = 3000;
const CHALLENGE_HOLD_MS = 1500;
const SCORE_PASS_THRESHOLD = 82;
const ISSUE_VISIBLE_DELAY_MS = 1500;
const STEP_TRANSITION_MS = 1300;
const OCCLUSION_SAMPLE_WIDTH = 128;
const OCCLUSION_SAMPLE_HEIGHT = 96;
const OCCLUSION_HISTORY_MS = 1400;
const OCCLUSION_DROPOUT_GRACE_MS = 480;
const OCCLUSION_MIN_HISTORY_MS = 360;
const OCCLUSION_PASS_SCORE = 0.74;
const OCCLUSION_PASS_RATIO = 0.62;
const LANDMARK_JITTER_SPIKE_THRESHOLD = 0.01;
const LANDMARK_JITTER_HARD_SPIKE_THRESHOLD = 0.02;
const FACE_CENTER_X_TARGET = 0.5;
const FACE_CENTER_Y_TARGET = 0.51;
const FACE_CENTER_X_TOLERANCE = 0.16;
const FACE_CENTER_Y_TOLERANCE = 0.2;
const FACE_WIDTH_MIN = 0.2;
const FACE_WIDTH_MAX = 0.68;
const FACE_HEIGHT_MIN = 0.28;
const FACE_HEIGHT_MAX = 0.88;
const FACE_SCORE_WIDTH_MIN = 0.24;
const FACE_SCORE_WIDTH_MAX = 0.62;
const FACE_SCORE_HEIGHT_MIN = 0.32;
const FACE_SCORE_HEIGHT_MAX = 0.84;
const initialVisualLayers: VisualLayerState = {
  mesh: false,
  contours: false,
  keyPoints: false,
  vectors: false,
};
const VISUAL_LAYER_OPTIONS: { id: VisualLayerId; label: string }[] = [
  { id: "mesh", label: "mesh" },
  { id: "contours", label: "contours" },
  { id: "keyPoints", label: "key points" },
  { id: "vectors", label: "vectors" },
];
const KEY_LANDMARKS = [
  { index: 1, label: "1" },
  { index: 10, label: "10" },
  { index: 13, label: "13" },
  { index: 14, label: "14" },
  { index: 33, label: "33" },
  { index: 61, label: "61" },
  { index: 98, label: "98" },
  { index: 133, label: "133" },
  { index: 145, label: "145" },
  { index: 152, label: "152" },
  { index: 159, label: "159" },
  { index: 168, label: "168" },
  { index: 263, label: "263" },
  { index: 291, label: "291" },
  { index: 327, label: "327" },
  { index: 362, label: "362" },
  { index: 374, label: "374" },
  { index: 386, label: "386" },
];
const VECTOR_LANDMARKS = [
  { from: 33, to: 263, label: "eye axis", color: "rgba(80, 230, 255, 0.95)" },
  { from: 10, to: 152, label: "pitch axis", color: "rgba(216, 255, 55, 0.95)" },
  { from: 61, to: 291, label: "mouth seam", color: "rgba(255, 195, 95, 0.95)" },
  { from: 159, to: 145, label: "L EAR", color: "rgba(255, 91, 163, 0.95)" },
  { from: 386, to: 374, label: "R EAR", color: "rgba(255, 91, 163, 0.95)" },
];
const JITTER_REFERENCE = Array.from(new Set([...FACE_OVAL, 33, 263, 1, 10, 152, 168]));
const JITTER_SNAPSHOT_INDICES = Array.from(new Set([...JITTER_REFERENCE, ...LEFT_EYE_DENSE, ...RIGHT_EYE_DENSE, ...NOSE_DENSE, ...MOUTH_DENSE]));

const initialMetrics: LivenessMetrics = {
  detected: false,
  singleFace: false,
  centered: false,
  properSize: false,
  lightingGood: false,
  occlusionClear: false,
  occlusionRawClear: false,
  occlusionScore: 0,
  landmarkJitter: 0,
  eyeJitter: 0,
  noseJitter: 0,
  mouthJitter: 0,
  jitterSpikeRatio: 0,
  jitterSpikeCount: 0,
  mouthJitterSpikeRatio: 0,
  mouthJitterSpikeCount: 0,
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

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lowerBoundScore(value: number, min: number, softMargin: number) {
  return clamp01((value - (min - softMargin)) / softMargin);
}

function makeNormalizedSnapshot(landmarks: LandmarkPoint[], bounds: Bounds) {
  const snapshot: NormalizedLandmarkSnapshot = new Map();

  for (const index of JITTER_SNAPSHOT_INDICES) {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) continue;

    snapshot.set(index, {
      x: (landmark.x - bounds.centerX) / Math.max(0.0001, bounds.width),
      y: (landmark.y - bounds.centerY) / Math.max(0.0001, bounds.height),
    });
  }

  return snapshot;
}

function getSnapshotJitter(previous: NormalizedLandmarkSnapshot | null, current: NormalizedLandmarkSnapshot, indices: number[]) {
  if (!previous) return 0;

  let total = 0;
  let count = 0;

  for (const index of indices) {
    const previousPoint = previous.get(index);
    const currentPoint = current.get(index);
    if (!previousPoint || !currentPoint) continue;
    total += distance(previousPoint, currentPoint);
    count += 1;
  }

  return count > 0 ? total / count : 0;
}

function getLandmarkJitterSignal(
  previous: NormalizedLandmarkSnapshot | null,
  landmarks: LandmarkPoint[],
  bounds: Bounds,
): LandmarkJitterSignal {
  const snapshot = makeNormalizedSnapshot(landmarks, bounds);
  const global = getSnapshotJitter(previous, snapshot, JITTER_REFERENCE);
  const leftEye = getSnapshotJitter(previous, snapshot, LEFT_EYE_DENSE);
  const rightEye = getSnapshotJitter(previous, snapshot, RIGHT_EYE_DENSE);
  const eyes = Math.max(leftEye, rightEye);
  const nose = getSnapshotJitter(previous, snapshot, NOSE_DENSE);
  const mouth = getSnapshotJitter(previous, snapshot, MOUTH_DENSE);
  const stableBaseline = Math.max(0.0045, global * 1.55);
  const excess = Math.max(0, eyes - stableBaseline, nose - stableBaseline, mouth - stableBaseline);
  const score = 1 - clamp01(excess / 0.022);
  const severe = excess > 0.018 && Math.max(eyes, nose, mouth) > Math.max(0.016, global * 2.1);

  return {
    global,
    eyes,
    nose,
    mouth,
    score,
    severe,
    snapshot,
  };
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

function getLandmarkGroup(landmarks: LandmarkPoint[], indices: number[]) {
  const points = indices.map((index) => landmarks[index]);
  if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  return points as LandmarkPoint[];
}

function getPolygonArea(points: LandmarkPoint[]) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

function getPointBounds(points: LandmarkPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function getBoundsArea(points: LandmarkPoint[]) {
  const bounds = getPointBounds(points);
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}

function getPixelFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): PixelFrame | null {
  canvas.width = OCCLUSION_SAMPLE_WIDTH;
  canvas.height = OCCLUSION_SAMPLE_HEIGHT;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, OCCLUSION_SAMPLE_WIDTH, OCCLUSION_SAMPLE_HEIGHT);
  const imageData = ctx.getImageData(0, 0, OCCLUSION_SAMPLE_WIDTH, OCCLUSION_SAMPLE_HEIGHT);
  return {
    data: imageData.data,
    width: OCCLUSION_SAMPLE_WIDTH,
    height: OCCLUSION_SAMPLE_HEIGHT,
  };
}

function getRegionSignal(frame: PixelFrame | null, points: LandmarkPoint[], paddingX: number, paddingY: number): RegionSignal {
  if (!frame || !points.length) {
    return { brightness: 0, contrast: 0, edge: 0, saturation: 0 };
  }

  const bounds = getPointBounds(points);
  const minX = Math.max(0, Math.floor((bounds.minX - paddingX) * frame.width));
  const maxX = Math.min(frame.width - 1, Math.ceil((bounds.maxX + paddingX) * frame.width));
  const minY = Math.max(0, Math.floor((bounds.minY - paddingY) * frame.height));
  const maxY = Math.min(frame.height - 1, Math.ceil((bounds.maxY + paddingY) * frame.height));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  if (width < 3 || height < 3) {
    return { brightness: 0, contrast: 0, edge: 0, saturation: 0 };
  }

  const lumas = new Float32Array(width * height);
  let total = 0;
  let saturationTotal = 0;
  let offset = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const pixelIndex = (y * frame.width + x) * 4;
      const r = frame.data[pixelIndex] ?? 0;
      const g = frame.data[pixelIndex + 1] ?? 0;
      const b = frame.data[pixelIndex + 2] ?? 0;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      lumas[offset] = luminance;
      total += luminance;
      saturationTotal += maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
      offset += 1;
    }
  }

  const count = Math.max(1, lumas.length);
  const brightness = total / count;
  const variance = lumas.reduce((sum, luminance) => sum + Math.pow(luminance - brightness, 2), 0) / count;

  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      edgeTotal += Math.abs((lumas[index] ?? 0) - (lumas[index - 1] ?? 0));
      edgeTotal += Math.abs((lumas[index] ?? 0) - (lumas[index - width] ?? 0));
      edgeCount += 2;
    }
  }

  return {
    brightness,
    contrast: Math.sqrt(variance),
    edge: edgeTotal / Math.max(1, edgeCount),
    saturation: saturationTotal / count,
  };
}

function getFrameLuma(frame: PixelFrame, x: number, y: number) {
  const pixelX = Math.max(0, Math.min(frame.width - 1, Math.round(x * frame.width)));
  const pixelY = Math.max(0, Math.min(frame.height - 1, Math.round(y * frame.height)));
  const pixelIndex = (pixelY * frame.width + pixelX) * 4;
  const r = frame.data[pixelIndex] ?? 0;
  const g = frame.data[pixelIndex + 1] ?? 0;
  const b = frame.data[pixelIndex + 2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getMouthLineSignal(
  frame: PixelFrame | null,
  mouthLeft: LandmarkPoint,
  mouthRight: LandmarkPoint,
  upperLip: LandmarkPoint,
  lowerLip: LandmarkPoint,
  faceHeight: number,
): MouthLineSignal {
  if (!frame) {
    return { seamDarkness: 0, lineContrast: 0, lineEdge: 0, lineBrightness: 255 };
  }

  const verticalOffset = Math.max(0.006, faceHeight * 0.02);
  const lineY = (upperLip.y + lowerLip.y) / 2;
  const samples: number[] = [];
  const upperSamples: number[] = [];
  const lowerSamples: number[] = [];

  for (let index = 0; index < 13; index += 1) {
    const t = 0.16 + index * 0.056;
    const x = mouthLeft.x + (mouthRight.x - mouthLeft.x) * t;
    const cornerY = mouthLeft.y + (mouthRight.y - mouthLeft.y) * t;
    const y = lineY * 0.74 + cornerY * 0.26;
    samples.push(getFrameLuma(frame, x, y));
    upperSamples.push(getFrameLuma(frame, x, y - verticalOffset));
    lowerSamples.push(getFrameLuma(frame, x, y + verticalOffset));
  }

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const lineBrightness = average(samples);
  const surroundingBrightness = (average(upperSamples) + average(lowerSamples)) / 2;
  const lineVariance = samples.reduce((sum, value) => sum + Math.pow(value - lineBrightness, 2), 0) / Math.max(1, samples.length);
  const lineEdge =
    samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - (samples[index] ?? value)), 0) /
    Math.max(1, samples.length - 1);

  return {
    seamDarkness: surroundingBrightness - lineBrightness,
    lineContrast: Math.sqrt(lineVariance),
    lineEdge,
    lineBrightness,
  };
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

function isDrawablePoint(point: LandmarkPoint | undefined) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[],
  connections: LandmarkConnection[],
  color: string,
  lineWidth: number,
) {
  if (!connections.length) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const connection of connections) {
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];
    if (!isDrawablePoint(start) || !isDrawablePoint(end)) continue;

    const from = mapPoint(start, video, canvas);
    const to = mapPoint(end, video, canvas);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLandmarkDots(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[],
) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.58)";

  for (const landmark of landmarks) {
    if (!isDrawablePoint(landmark)) continue;
    const point = mapPoint(landmark, video, canvas);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string) {
  ctx.save();
  ctx.font = "800 10px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textBaseline = "middle";

  const paddingX = 4;
  const textWidth = ctx.measureText(label).width;
  const boxX = x + 7;
  const boxY = y - 9;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 18;

  ctx.fillStyle = "rgba(5, 6, 11, 0.82)";
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
  ctx.fillStyle = color;
  ctx.fillText(label, boxX + paddingX, y);
  ctx.restore();
}

function drawKeyPoints(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[],
) {
  ctx.save();
  ctx.lineWidth = 1.5;

  for (const keyPoint of KEY_LANDMARKS) {
    const landmark = landmarks[keyPoint.index];
    if (!isDrawablePoint(landmark)) continue;

    const point = mapPoint(landmark, video, canvas);
    ctx.fillStyle = "#d8ff37";
    ctx.strokeStyle = "rgba(5, 6, 11, 0.92)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawLabel(ctx, point.x, point.y, keyPoint.label, "#d8ff37");
  }

  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  label: string,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = 10;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  drawLabel(ctx, (from.x + to.x) / 2, (from.y + to.y) / 2, label, color);
  ctx.restore();
}

function drawVectors(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[],
) {
  for (const vector of VECTOR_LANDMARKS) {
    const fromPoint = landmarks[vector.from];
    const toPoint = landmarks[vector.to];
    if (!isDrawablePoint(fromPoint) || !isDrawablePoint(toPoint)) continue;

    drawArrow(ctx, mapPoint(fromPoint, video, canvas), mapPoint(toPoint, video, canvas), vector.color, vector.label);
  }

  const bounds = getFaceBounds(landmarks);
  const noseTip = landmarks[NOSE_TIP];
  if (bounds && isDrawablePoint(noseTip)) {
    const center = mapPoint({ x: bounds.centerX, y: bounds.centerY }, video, canvas);
    const nose = mapPoint(noseTip, video, canvas);
    drawArrow(ctx, center, nose, "rgba(255, 255, 255, 0.96)", "yaw offset");
  }
}

function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: LandmarkPoint[] | null,
  metrics: LivenessMetrics,
  activeStep: LivenessStepId,
  visualLayers: VisualLayerState,
  connectionSets: LandmarkConnectionSets,
) {
  resizeCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  const cx = canvas.clientWidth / 2;
  if (!landmarks) return;

  if (visualLayers.mesh) {
    drawConnections(ctx, canvas, video, landmarks, connectionSets.mesh, "rgba(82, 214, 255, 0.26)", 0.8);
    drawLandmarkDots(ctx, canvas, video, landmarks);
  }

  if (visualLayers.contours) {
    drawConnections(ctx, canvas, video, landmarks, connectionSets.contours, "rgba(216, 255, 55, 0.9)", 2);
  }

  if (visualLayers.keyPoints) {
    drawKeyPoints(ctx, canvas, video, landmarks);
  }

  if (visualLayers.vectors) {
    drawVectors(ctx, canvas, video, landmarks);
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

function isFrontPoseReady(metrics: LivenessMetrics) {
  return (
    metrics.score >= SCORE_PASS_THRESHOLD &&
    metrics.occlusionClear &&
    Math.abs(metrics.yawRatio) <= FRONT_YAW_LIMIT &&
    metrics.pitchRatio >= FRONT_PITCH_MIN &&
    metrics.pitchRatio <= FRONT_PITCH_MAX
  );
}

function getQualityIssue(metrics: LivenessMetrics): QualityIssue | null {
  if (!metrics.detected) {
    if (metrics.brightness > 0 && metrics.brightness < 45) {
      return {
        key: "no-face-dark",
        message: "어두운 환경에서는 얼굴 인식이 어렵습니다. 조명을 켜고 얼굴을 밝게 비춰 주세요.",
      };
    }
    if (metrics.brightness > 228) {
      return {
        key: "no-face-overexposed",
        message: "빛이 너무 강하거나 역광입니다. 얼굴이 하얗게 날아가지 않도록 방향을 조정해 주세요.",
      };
    }
    if (metrics.contrast > 0 && metrics.contrast < 10) {
      return {
        key: "no-face-low-contrast",
        message: "얼굴과 배경 구분이 약합니다. 조명 방향을 바꾸거나 더 밝은 곳에서 시도해 주세요.",
      };
    }
    return {
      key: "no-face",
      message: "얼굴이 화면에 보이지 않습니다. 얼굴 전체가 안내선 안에 들어오게 맞춰 주세요.",
    };
  }

  if (!metrics.singleFace) {
    return {
      key: "multi-face",
      message: "두 명 이상이 화면에 잡혔습니다. 인증 대상 한 명만 화면에 나오게 해 주세요.",
    };
  }

  if (!metrics.properSize) {
    if (metrics.faceWidth < FACE_WIDTH_MIN || metrics.faceHeight < FACE_HEIGHT_MIN) {
      return {
        key: "face-too-small",
        message: "얼굴이 너무 작게 보입니다. 카메라에 조금 더 가까이 다가와 주세요.",
      };
    }
    return {
      key: "face-too-large",
      message: "얼굴이 너무 크게 보입니다. 카메라에서 조금 더 떨어져 주세요.",
    };
  }

  if (!metrics.centered) {
    return {
      key: "off-center",
      message: "얼굴이 프레임 중앙에서 벗어났습니다. 화면 중앙에 얼굴을 맞춰 주세요.",
    };
  }

  if (!metrics.lightingGood) {
    if (metrics.brightness < 55) {
      return {
        key: "dark",
        message: "조명이 어두워 얼굴 특징점을 읽기 어렵습니다. 불을 켜거나 밝은 곳으로 이동해 주세요.",
      };
    }
    if (metrics.brightness > 218) {
      return {
        key: "overexposed",
        message: "조명이 너무 강합니다. 역광이나 직사광선을 피해서 얼굴 윤곽이 보이게 해 주세요.",
      };
    }
    return {
      key: "low-contrast",
      message: "조명 대비가 낮아 얼굴 윤곽이 흐립니다. 얼굴 쪽 조명을 고르게 맞춰 주세요.",
    };
  }

  if (!metrics.occlusionClear) {
    return {
      key: "occlusion",
      message: "눈, 코, 입 주변 특징점이 가려져 인식이 어렵습니다. 얼굴 주요 부위가 보이게 해 주세요.",
    };
  }

  if (metrics.score < SCORE_PASS_THRESHOLD) {
    return {
      key: "low-score",
      message: `품질 점수 ${SCORE_PASS_THRESHOLD}점 이상이 필요합니다. 얼굴 위치와 조명을 조금 더 맞춰 주세요.`,
    };
  }

  return null;
}

export function ActiveLivenessPrototype() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const connectionSetsRef = useRef<LandmarkConnectionSets>({ mesh: [], contours: [] });
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
  const blinkPhaseRef = useRef<BlinkPhase>("waitingOpen");
  const baselinePitchRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const displayedIssueRef = useRef("");
  const issueCandidateRef = useRef<{ key: string; startedAt: number } | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const transitioningRef = useRef(false);
  const visualLayersRef = useRef<VisualLayerState>(initialVisualLayers);
  const landmarkSnapshotRef = useRef<NormalizedLandmarkSnapshot | null>(null);
  const occlusionHistoryRef = useRef<OcclusionHistoryFrame[]>([]);
  const lastOcclusionClearAtRef = useRef<number | null>(null);

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
  const [displayIssue, setDisplayIssue] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [visualLayers, setVisualLayers] = useState<VisualLayerState>(initialVisualLayers);

  const moveToStep = (step: LivenessStepId) => {
    activeStepRef.current = step;
    setActiveStep(step);
  };

  const setChallengeState = (next: ChallengeState) => {
    challengeRef.current = next;
    setChallenge(next);
  };

  const toggleVisualLayer = (layerId: VisualLayerId) => {
    setVisualLayers((current) => {
      const next = { ...current, [layerId]: !current[layerId] };
      visualLayersRef.current = next;
      return next;
    });
  };

  const setVisibleIssue = (message: string) => {
    if (displayedIssueRef.current === message) return;
    displayedIssueRef.current = message;
    setDisplayIssue(message);
  };

  const clearVisibleIssue = () => {
    issueCandidateRef.current = null;
    setVisibleIssue("");
  };

  const resetTemporalOcclusion = () => {
    landmarkSnapshotRef.current = null;
    occlusionHistoryRef.current = [];
    lastOcclusionClearAtRef.current = null;
  };

  const updateTemporalOcclusion = (
    now: number,
    rawClear: boolean,
    frameScore: number,
    jitterSignal: LandmarkJitterSignal,
  ) => {
    const jitterSpike =
      jitterSignal.global > LANDMARK_JITTER_SPIKE_THRESHOLD ||
      jitterSignal.mouth > LANDMARK_JITTER_SPIKE_THRESHOLD;
    const mouthJitterSpike = jitterSignal.mouth > LANDMARK_JITTER_SPIKE_THRESHOLD;
    const hardJitterSpike =
      jitterSignal.global > LANDMARK_JITTER_HARD_SPIKE_THRESHOLD ||
      jitterSignal.mouth > LANDMARK_JITTER_HARD_SPIKE_THRESHOLD ||
      jitterSignal.eyes > LANDMARK_JITTER_HARD_SPIKE_THRESHOLD ||
      jitterSignal.nose > LANDMARK_JITTER_HARD_SPIKE_THRESHOLD;
    const history = [
      ...occlusionHistoryRef.current.filter((frame) => now - frame.at <= OCCLUSION_HISTORY_MS),
      {
        at: now,
        score: frameScore,
        rawClear,
        severeJitter: jitterSignal.severe,
        jitterSpike,
        mouthJitterSpike,
        hardJitterSpike,
      },
    ];
    occlusionHistoryRef.current = history;

    const firstAt = history[0]?.at ?? now;
    const historyMs = now - firstAt;
    const averageScore = average(history.map((frame) => frame.score));
    const passRatio = history.filter((frame) => frame.rawClear || frame.score >= OCCLUSION_PASS_SCORE).length / Math.max(1, history.length);
    const severeRatio = history.filter((frame) => frame.severeJitter).length / Math.max(1, history.length);
    const jitterSpikeCount = history.filter((frame) => frame.jitterSpike).length;
    const mouthJitterSpikeCount = history.filter((frame) => frame.mouthJitterSpike).length;
    const hardJitterSpikeCount = history.filter((frame) => frame.hardJitterSpike).length;
    const jitterSpikeRatio = jitterSpikeCount / Math.max(1, history.length);
    const mouthJitterSpikeRatio = mouthJitterSpikeCount / Math.max(1, history.length);
    const hardJitterSpikeRatio = hardJitterSpikeCount / Math.max(1, history.length);
    const enoughHistory = historyMs >= OCCLUSION_MIN_HISTORY_MS;
    const spikePressure = Math.max(
      clamp01((jitterSpikeRatio - 0.12) / 0.36),
      clamp01((mouthJitterSpikeRatio - 0.1) / 0.34),
      clamp01(hardJitterSpikeRatio / 0.12),
    );
    const sustainedJitter =
      enoughHistory &&
      ((jitterSpikeCount >= 6 && jitterSpikeRatio >= 0.18) ||
        (mouthJitterSpikeCount >= 5 && mouthJitterSpikeRatio >= 0.14) ||
        hardJitterSpikeCount >= 2);
    const temporalScore = clamp01(averageScore * 0.72 + passRatio * 0.18 + (1 - spikePressure) * 0.1 - spikePressure * 0.58);
    const immediateClear = rawClear && !jitterSignal.severe && !jitterSpike;
    const stableClear =
      enoughHistory &&
      !sustainedJitter &&
      averageScore >= OCCLUSION_PASS_SCORE &&
      passRatio >= OCCLUSION_PASS_RATIO &&
      severeRatio < 0.34;
    const warmingUpClear = !enoughHistory && frameScore >= OCCLUSION_PASS_SCORE && severeRatio < 0.34 && hardJitterSpikeCount === 0;

    if (sustainedJitter) {
      return {
        clear: false,
        score: temporalScore,
        jitterSpikeRatio,
        jitterSpikeCount,
        mouthJitterSpikeRatio,
        mouthJitterSpikeCount,
      };
    }

    if (immediateClear || stableClear || warmingUpClear) {
      lastOcclusionClearAtRef.current = now;
      return {
        clear: true,
        score: temporalScore,
        jitterSpikeRatio,
        jitterSpikeCount,
        mouthJitterSpikeRatio,
        mouthJitterSpikeCount,
      };
    }

    const lastClearAt = lastOcclusionClearAtRef.current;
    if (
      lastClearAt !== null &&
      now - lastClearAt <= OCCLUSION_DROPOUT_GRACE_MS &&
      averageScore >= 0.58 &&
      severeRatio < 0.46 &&
      jitterSpikeRatio < 0.32 &&
      hardJitterSpikeRatio < 0.12
    ) {
      return {
        clear: true,
        score: temporalScore,
        jitterSpikeRatio,
        jitterSpikeCount,
        mouthJitterSpikeRatio,
        mouthJitterSpikeCount,
      };
    }

    return {
      clear: false,
      score: temporalScore,
      jitterSpikeRatio,
      jitterSpikeCount,
      mouthJitterSpikeRatio,
      mouthJitterSpikeCount,
    };
  };

  const stopLoop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopCamera = () => {
    stopLoop();
    clearStepTransition();
    clearVisibleIssue();
    resetTemporalOcclusion();
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

  const clearStepTransition = () => {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    transitioningRef.current = false;
    setIsTransitioning(false);
  };

  const scheduleStepAdvance = (nextStep: LivenessStepId) => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    setIsTransitioning(true);
    clearVisibleIssue();
    resetHolds();
    resetTemporalOcclusion();

    transitionTimeoutRef.current = window.setTimeout(() => {
      transitionTimeoutRef.current = null;
      transitioningRef.current = false;
      setIsTransitioning(false);
      resetHolds();
      resetTemporalOcclusion();
      moveToStep(nextStep);
    }, STEP_TRANSITION_MS);
  };

  const updateVisibleIssue = (nextMetrics: LivenessMetrics, now: number) => {
    if (activeStepRef.current === "complete" || transitioningRef.current) {
      clearVisibleIssue();
      return;
    }

    const issue = getQualityIssue(nextMetrics);
    if (!issue) {
      clearVisibleIssue();
      return;
    }

    const candidate = issueCandidateRef.current;
    if (!candidate || candidate.key !== issue.key) {
      issueCandidateRef.current = { key: issue.key, startedAt: now };
      setVisibleIssue("");
      return;
    }

    if (now - candidate.startedAt >= ISSUE_VISIBLE_DELAY_MS) {
      setVisibleIssue(issue.message);
    }
  };

  const resetSession = () => {
    clearStepTransition();
    clearVisibleIssue();
    resetTemporalOcclusion();
    resetHolds();
    blinkPhaseRef.current = "waitingOpen";
    baselinePitchRef.current = null;
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
      connectionSetsRef.current = {
        mesh: vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        contours: vision.FaceLandmarker.FACE_LANDMARKS_CONTOURS,
      };
      landmarkerRef.current = landmarker;
      setModelState("ready");
      return landmarker;
    } catch (error) {
      setModelState("failed");
      throw error;
    }
  };

  const startCamera = async () => {
    stopLoop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

      const now = performance.now();
      const result = withSuppressedTfliteInfo(() => landmarker.detectForVideo(video, now));
      const faces = result?.faceLandmarks ?? [];
      const landmarks = faces[0] ?? null;

      if (startedAtRef.current) {
        setElapsedMs(now - startedAtRef.current);
      }

      if (!landmarks) {
        const currentStep = activeStepRef.current;
        if (currentStep !== "complete" && !transitioningRef.current) {
          holdStartRef.current[currentStep] = null;
        }
        if (currentStep === "frontBlink") {
          blinkPhaseRef.current = "waitingOpen";
        }
        resetTemporalOcclusion();
        const noFaceMetrics = buildNoFaceMetrics(video);
        setMetrics(noFaceMetrics);
        updateVisibleIssue(noFaceMetrics, now);
        drawOverlay(canvas, video, null, noFaceMetrics, currentStep, visualLayersRef.current, connectionSetsRef.current);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const nextMetrics = buildMetrics(video, landmarks, faces.length, now);
      setMetrics(nextMetrics);
      const currentStep = activeStepRef.current;
      drawOverlay(canvas, video, landmarks, nextMetrics, currentStep, visualLayersRef.current, connectionSetsRef.current);
      updateVisibleIssue(nextMetrics, now);

      let nextChallenge = challengeRef.current;
      let changed = false;
      const qualityReady = nextMetrics.score >= SCORE_PASS_THRESHOLD && nextMetrics.occlusionClear;
      const baselinePitch = baselinePitchRef.current ?? nextMetrics.pitchRatio;
      const pitchDelta = nextMetrics.pitchRatio - baselinePitch;

      const markPassed = (key: keyof ChallengeState) => {
        if (nextChallenge[key]) return;
        nextChallenge = { ...nextChallenge, [key]: true };
        changed = true;
      };

      if (transitioningRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (currentStep === "frontBlink") {
        const frontPoseReady = isFrontPoseReady(nextMetrics);

        if (!frontPoseReady) {
          blinkPhaseRef.current = "waitingOpen";
        } else if (blinkPhaseRef.current === "waitingOpen" && nextMetrics.averageEar >= EYES_OPEN_EAR) {
          blinkPhaseRef.current = "waitingClosed";
        } else if (blinkPhaseRef.current === "waitingClosed" && nextMetrics.averageEar <= EYES_CLOSED_EAR) {
          blinkPhaseRef.current = "waitingReopen";
        } else if (blinkPhaseRef.current === "waitingReopen" && nextMetrics.averageEar >= EYES_OPEN_EAR) {
          blinkPhaseRef.current = "confirmed";
        }

        if (frontPoseReady && blinkPhaseRef.current === "confirmed") {
          holdStartRef.current.frontBlink ??= now;
        } else {
          holdStartRef.current.frontBlink = null;
        }

        const frontHeld =
          holdStartRef.current.frontBlink !== null && now - holdStartRef.current.frontBlink >= FRONT_HOLD_MS;
        if (frontHeld) {
          baselinePitchRef.current = nextMetrics.pitchRatio;
          markPassed("frontBlink");
          scheduleStepAdvance("right");
        }
      }

      if (currentStep === "right" && qualityReady && nextMetrics.yawRatio >= USER_YAW_TARGET) {
        holdStartRef.current.right ??= now;
        if (now - holdStartRef.current.right >= CHALLENGE_HOLD_MS) {
          markPassed("right");
          scheduleStepAdvance("left");
        }
      } else if (currentStep === "right") {
        holdStartRef.current.right = null;
      }

      if (currentStep === "left" && qualityReady && nextMetrics.yawRatio <= -USER_YAW_TARGET) {
        holdStartRef.current.left ??= now;
        if (now - holdStartRef.current.left >= CHALLENGE_HOLD_MS) {
          markPassed("left");
          scheduleStepAdvance("down");
        }
      } else if (currentStep === "left") {
        holdStartRef.current.left = null;
      }

      if (currentStep === "down" && qualityReady && pitchDelta >= PITCH_DELTA_TARGET) {
        holdStartRef.current.down ??= now;
        if (now - holdStartRef.current.down >= CHALLENGE_HOLD_MS) {
          markPassed("down");
          scheduleStepAdvance("up");
        }
      } else if (currentStep === "down") {
        holdStartRef.current.down = null;
      }

      if (currentStep === "up" && qualityReady && pitchDelta <= -PITCH_DELTA_TARGET) {
        holdStartRef.current.up ??= now;
        if (now - holdStartRef.current.up >= CHALLENGE_HOLD_MS) {
          markPassed("up");
          scheduleStepAdvance("complete");
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

  function buildMetrics(video: HTMLVideoElement, landmarks: LandmarkPoint[], faceCount: number, now: number): LivenessMetrics {
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
    const noseBridge = landmarks[168];
    const noseLeft = landmarks[98];
    const noseRight = landmarks[327];
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftEyeDense = getLandmarkGroup(landmarks, LEFT_EYE_DENSE);
    const rightEyeDense = getLandmarkGroup(landmarks, RIGHT_EYE_DENSE);
    const noseDense = getLandmarkGroup(landmarks, NOSE_DENSE);
    const mouthDense = getLandmarkGroup(landmarks, MOUTH_DENSE);

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
      !noseBridge ||
      !noseLeft ||
      !noseRight ||
      !upperLip ||
      !lowerLip ||
      !leftEyeDense ||
      !rightEyeDense ||
      !noseDense ||
      !mouthDense
    ) {
      resetTemporalOcclusion();
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
    const lightingCanvas = lightingCanvasRef.current ?? document.createElement("canvas");
    lightingCanvasRef.current = lightingCanvas;
    const lighting = getLighting(video, lightingCanvas);
    const pixelFrame = getPixelFrame(video, lightingCanvas);
    const leftEyeSignal = getRegionSignal(pixelFrame, leftEyeDense, 0.035, 0.03);
    const rightEyeSignal = getRegionSignal(pixelFrame, rightEyeDense, 0.035, 0.03);
    const noseSignal = getRegionSignal(pixelFrame, noseDense, 0.028, 0.035);
    const mouthSignal = getRegionSignal(pixelFrame, mouthDense, 0.035, 0.03);
    const mouthLineSignal = getMouthLineSignal(pixelFrame, mouthLeft, mouthRight, upperLip, lowerLip, bounds.height);
    const centered =
      Math.abs(bounds.centerX - FACE_CENTER_X_TARGET) < FACE_CENTER_X_TOLERANCE &&
      Math.abs(bounds.centerY - FACE_CENTER_Y_TARGET) < FACE_CENTER_Y_TOLERANCE;
    const properSize =
      bounds.width > FACE_WIDTH_MIN &&
      bounds.width < FACE_WIDTH_MAX &&
      bounds.height > FACE_HEIGHT_MIN &&
      bounds.height < FACE_HEIGHT_MAX;
    const singleFace = faceCount === 1;
    const faceArea = Math.max(0.0001, bounds.width * bounds.height);
    const leftEyeWidthRatio = distance(leftEyeOuter, leftEyeInner) / Math.max(0.0001, bounds.width);
    const rightEyeWidthRatio = distance(rightEyeOuter, rightEyeInner) / Math.max(0.0001, bounds.width);
    const leftEyeAreaRatio = getPolygonArea(leftEyeDense) / faceArea;
    const rightEyeAreaRatio = getPolygonArea(rightEyeDense) / faceArea;
    const noseWidthRatio = distance(noseLeft, noseRight) / Math.max(0.0001, bounds.width);
    const noseBridgeRatio = distance(noseBridge, noseTip) / Math.max(0.0001, bounds.height);
    const mouthDenseBounds = getPointBounds(mouthDense);
    const mouthDenseWidthRatio = (mouthDenseBounds.maxX - mouthDenseBounds.minX) / Math.max(0.0001, bounds.width);
    const mouthDenseHeightRatio = (mouthDenseBounds.maxY - mouthDenseBounds.minY) / Math.max(0.0001, bounds.height);
    const lipGapRatio = distance(upperLip, lowerLip) / Math.max(0.0001, bounds.height);
    const eyesShapeScore = average([
      lowerBoundScore(leftEyeWidthRatio, 0.11, 0.045),
      lowerBoundScore(rightEyeWidthRatio, 0.11, 0.045),
      scoreRange(eyeWidthRatio, 1, 2.45, 0.8),
      lowerBoundScore(averageEar, 0.07, 0.055),
      lowerBoundScore(leftEyeAreaRatio, 0.00055, 0.00045),
      lowerBoundScore(rightEyeAreaRatio, 0.00055, 0.00045),
    ]);
    const noseShapeScore = average([
      scoreRange(noseWidthRatio, 0.07, 0.36, 0.06),
      scoreRange(noseBridgeRatio, 0.07, 0.38, 0.08),
      lowerBoundScore(noseTip.y - (eyeCenterY + bounds.height * 0.05), 0, bounds.height * 0.06),
      lowerBoundScore(mouthCenterY - bounds.height * 0.035 - noseTip.y, 0, bounds.height * 0.06),
      lowerBoundScore(getBoundsArea(noseDense) / faceArea, 0.008, 0.006),
    ]);
    const mouthShapeScore = average([
      scoreRange(mouthWidthRatio, 0.13, 0.62, 0.08),
      lowerBoundScore(mouthDenseWidthRatio, 0.15, 0.06),
      lowerBoundScore(mouthDenseHeightRatio, 0.025, 0.02),
      scoreRange(lipGapRatio, 0, 0.18, 0.07),
      lowerBoundScore(mouthCenterY - (noseTip.y + bounds.height * 0.065), 0, bounds.height * 0.06),
      lowerBoundScore(getBoundsArea(mouthDense) / faceArea, 0.006, 0.004),
    ]);
    const mouthSeamScore = average([
      lowerBoundScore(mouthLineSignal.seamDarkness, 3.2, 2.4),
      lowerBoundScore(mouthSignal.brightness - 1.4 - mouthLineSignal.lineBrightness, 0, 8),
      scoreRange(mouthLineSignal.lineBrightness, 18, 220, 34),
      Math.max(lowerBoundScore(mouthLineSignal.lineEdge, 1.2, 1.1), lowerBoundScore(mouthLineSignal.lineContrast, 2.8, 2.1)),
    ]);
    const eyesTextureScore = average([
      scoreRange(leftEyeSignal.brightness, 24, 236, 34),
      scoreRange(rightEyeSignal.brightness, 24, 236, 34),
      lowerBoundScore((leftEyeSignal.contrast + rightEyeSignal.contrast) / 2, 7.2, 5.2),
      lowerBoundScore((leftEyeSignal.edge + rightEyeSignal.edge) / 2, 2.6, 2.0),
    ]);
    const noseTextureScore = average([
      scoreRange(noseSignal.brightness, 24, 236, 34),
      Math.max(lowerBoundScore(noseSignal.contrast, 4.2, 3.0), lowerBoundScore(noseSignal.edge, 1.8, 1.4)),
    ]);
    const mouthTextureScore = average([
      scoreRange(mouthSignal.brightness, 24, 236, 34),
      lowerBoundScore(mouthSignal.contrast, 5.0, 3.6),
      lowerBoundScore(mouthSignal.edge, 2.0, 1.5),
      mouthSeamScore,
    ]);
    const eyesShapeClear =
      leftEyeWidthRatio > 0.11 &&
      rightEyeWidthRatio > 0.11 &&
      eyeWidthRatio < 2.45 &&
      averageEar > 0.07 &&
      leftEyeAreaRatio > 0.00055 &&
      rightEyeAreaRatio > 0.00055;
    const noseShapeClear =
      noseWidthRatio > 0.07 &&
      noseWidthRatio < 0.36 &&
      noseBridgeRatio > 0.07 &&
      noseBridgeRatio < 0.38 &&
      noseTip.y > eyeCenterY + bounds.height * 0.05 &&
      noseTip.y < mouthCenterY - bounds.height * 0.035 &&
      getBoundsArea(noseDense) / faceArea > 0.008;
    const mouthShapeClear =
      mouthWidthRatio > 0.13 &&
      mouthWidthRatio < 0.62 &&
      mouthDenseWidthRatio > 0.15 &&
      mouthDenseHeightRatio > 0.025 &&
      lipGapRatio < 0.18 &&
      mouthCenterY > noseTip.y + bounds.height * 0.065 &&
      getBoundsArea(mouthDense) / faceArea > 0.006;
    const mouthSeamClear =
      mouthLineSignal.seamDarkness >= 3.2 &&
      mouthLineSignal.lineBrightness < mouthSignal.brightness - 1.4 &&
      mouthLineSignal.lineBrightness > 18 &&
      mouthLineSignal.lineBrightness < 220 &&
      (mouthLineSignal.lineEdge >= 1.2 || mouthLineSignal.lineContrast >= 2.8);
    const eyesTextureClear =
      leftEyeSignal.brightness > 24 &&
      rightEyeSignal.brightness > 24 &&
      leftEyeSignal.brightness < 236 &&
      rightEyeSignal.brightness < 236 &&
      (leftEyeSignal.contrast + rightEyeSignal.contrast) / 2 >= 7.2 &&
      (leftEyeSignal.edge + rightEyeSignal.edge) / 2 >= 2.6;
    const noseTextureClear =
      noseSignal.brightness > 24 &&
      noseSignal.brightness < 236 &&
      (noseSignal.contrast >= 4.2 || noseSignal.edge >= 1.8);
    const mouthTextureClear =
      mouthSignal.brightness > 24 &&
      mouthSignal.brightness < 236 &&
      mouthSignal.contrast >= 5.0 &&
      mouthSignal.edge >= 2.0 &&
      mouthSeamClear;
    const rawOcclusionClear =
      eyesShapeClear && noseShapeClear && mouthShapeClear && eyesTextureClear && noseTextureClear && mouthTextureClear;
    const jitterSignal = getLandmarkJitterSignal(landmarkSnapshotRef.current, landmarks, bounds);
    landmarkSnapshotRef.current = jitterSignal.snapshot;
    const componentOcclusionScore = average([
      eyesShapeScore,
      noseShapeScore,
      mouthShapeScore,
      eyesTextureScore,
      noseTextureScore,
      mouthTextureScore,
    ]);
    const currentJitterSpikePenalty = clamp01(
      (Math.max(jitterSignal.global, jitterSignal.mouth, jitterSignal.eyes, jitterSignal.nose) - LANDMARK_JITTER_SPIKE_THRESHOLD) /
        (LANDMARK_JITTER_HARD_SPIKE_THRESHOLD - LANDMARK_JITTER_SPIKE_THRESHOLD),
    );
    const weightedFrameOcclusionScore = clamp01(
      componentOcclusionScore * 0.68 + jitterSignal.score * 0.14 + (1 - currentJitterSpikePenalty) * 0.18,
    );
    const frameOcclusionScore = rawOcclusionClear
      ? Math.max(0.78, weightedFrameOcclusionScore - currentJitterSpikePenalty * 0.18)
      : Math.max(0, weightedFrameOcclusionScore - currentJitterSpikePenalty * 0.28);
    const temporalOcclusion = updateTemporalOcclusion(now, rawOcclusionClear, frameOcclusionScore, jitterSignal);
    const occlusionClear = temporalOcclusion.clear;

    const scoreParts = [
      1,
      singleFace ? 1 : 0,
      (scoreRange(bounds.centerX, 0.42, 0.58, 0.2) + scoreRange(bounds.centerY, 0.4, 0.63, 0.22)) / 2,
      (scoreRange(bounds.width, FACE_SCORE_WIDTH_MIN, FACE_SCORE_WIDTH_MAX, 0.16) +
        scoreRange(bounds.height, FACE_SCORE_HEIGHT_MIN, FACE_SCORE_HEIGHT_MAX, 0.2)) /
        2,
      (scoreRange(lighting.brightness, 62, 208, 42) + scoreRange(lighting.contrast, 18, 96, 18)) / 2,
      occlusionClear ? 1 : 0,
    ];

    const baseScore = Math.round((scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length) * 100);

    return {
      detected: true,
      singleFace,
      centered,
      properSize,
      lightingGood: lighting.good,
      occlusionClear,
      occlusionRawClear: rawOcclusionClear,
      occlusionScore: temporalOcclusion.score,
      landmarkJitter: jitterSignal.global,
      eyeJitter: jitterSignal.eyes,
      noseJitter: jitterSignal.nose,
      mouthJitter: jitterSignal.mouth,
      jitterSpikeRatio: temporalOcclusion.jitterSpikeRatio,
      jitterSpikeCount: temporalOcclusion.jitterSpikeCount,
      mouthJitterSpikeRatio: temporalOcclusion.mouthJitterSpikeRatio,
      mouthJitterSpikeCount: temporalOcclusion.mouthJitterSpikeCount,
      yawRatio,
      pitchRatio,
      faceWidth: bounds.width,
      faceHeight: bounds.height,
      brightness: lighting.brightness,
      contrast: lighting.contrast,
      averageEar,
      score: occlusionClear ? baseScore : Math.min(baseScore, 68),
    };
  }

  const activeStepInfo = steps.find((step) => step.id === activeStep) ?? steps[0];
  const currentStepIndex = stepIndexOf(activeStep);
  const completedCount =
    Number(challenge.frontBlink) + Number(challenge.right) + Number(challenge.left) + Number(challenge.down) + Number(challenge.up);
  const passReady = activeStep === "complete";
  const currentHoldStart = activeStep === "complete" ? null : holdStartRef.current[activeStep];
  const currentHoldTarget = activeStep === "frontBlink" ? FRONT_HOLD_MS : CHALLENGE_HOLD_MS;
  const currentNow = startedAtRef.current === null ? 0 : startedAtRef.current + elapsedMs;
  const holdProgress =
    passReady || isTransitioning
      ? 1
      : currentHoldStart === null || currentNow === 0
        ? 0
        : clamp01((currentNow - currentHoldStart) / currentHoldTarget);
  const pitchDelta = baselinePitchRef.current === null ? 0 : metrics.pitchRatio - baselinePitchRef.current;
  const yawApproxDegrees = Math.round(metrics.yawRatio * 500);
  const pitchApprox = Math.round(pitchDelta * 1000);
  const currentStepReady =
    passReady || isTransitioning
      ? true
      : activeStep === "frontBlink"
        ? isFrontPoseReady(metrics) && blinkPhaseRef.current === "confirmed"
        : activeStep === "right"
          ? metrics.score >= SCORE_PASS_THRESHOLD && metrics.occlusionClear && metrics.yawRatio >= USER_YAW_TARGET
          : activeStep === "left"
            ? metrics.score >= SCORE_PASS_THRESHOLD && metrics.occlusionClear && metrics.yawRatio <= -USER_YAW_TARGET
            : activeStep === "down"
              ? metrics.score >= SCORE_PASS_THRESHOLD && metrics.occlusionClear && pitchDelta >= PITCH_DELTA_TARGET
              : activeStep === "up"
                ? metrics.score >= SCORE_PASS_THRESHOLD && metrics.occlusionClear && pitchDelta <= -PITCH_DELTA_TARGET
                : false;
  const recoverableIssueVisible = holdProgress <= 0 && !currentStepReady && !passReady && !isTransitioning;
  const statusMessage = errorMessage || (recoverableIssueVisible ? displayIssue : "");
  const progressPercent = Math.round((passReady || isTransitioning ? 1 : holdProgress) * 100);
  const ringState = statusMessage ? "warn" : passReady || isTransitioning ? "pass" : holdProgress > 0 ? "ready" : "idle";
  const actionLabel =
    cameraState === "requesting" || modelState === "loading"
      ? "시작 중"
      : cameraState === "running"
        ? "다시 시작하기"
        : cameraState === "failed"
          ? "다시 시도하기"
          : "카메라 시작하기";

  const primaryInstruction = useMemo(() => {
    if (cameraState === "requesting" || modelState === "loading") return "카메라를 준비하고 있습니다";
    if (cameraState !== "running") return "카메라를 시작하세요";
    if (isTransitioning) return "좋아요!";
    if (activeStep === "frontBlink") return "얼굴을 원 안에 맞추고 눈을 깜빡여주세요";
    if (activeStep === "right") return "고개를 오른쪽 50~60도 정도로 돌려주세요";
    if (activeStep === "left") return "고개를 왼쪽 50~60도 정도로 돌려주세요";
    if (activeStep === "down") return "고개를 아래로 살짝 숙여주세요";
    if (activeStep === "up") return "고개를 위로 살짝 들어주세요";
    return "인증이 완료되었습니다";
  }, [activeStep, cameraState, isTransitioning, modelState]);

  const qualityChecks = [
    ["얼굴", metrics.detected, metrics.detected ? 1 : 0],
    ["단일 인물", metrics.singleFace, metrics.singleFace ? 1 : 0],
    ["중앙", metrics.centered, metrics.centered ? 1 : 0.35],
    [
      "거리",
      metrics.properSize,
      (scoreRange(metrics.faceWidth, FACE_SCORE_WIDTH_MIN, FACE_SCORE_WIDTH_MAX, 0.16) +
        scoreRange(metrics.faceHeight, FACE_SCORE_HEIGHT_MIN, FACE_SCORE_HEIGHT_MAX, 0.2)) /
        2,
    ],
    ["조명", metrics.lightingGood, (scoreRange(metrics.brightness, 62, 208, 42) + scoreRange(metrics.contrast, 18, 96, 18)) / 2],
    ["가림", metrics.occlusionClear, metrics.occlusionScore],
  ] as const;

  const renderDetailPanel = () => (
    <div className="liveness-detail-panel" onClick={(event) => event.stopPropagation()}>
      <div className="liveness-detail-header">
        <div>
          <span>Active Liveness</span>
          <strong>{passReady ? "PASS" : activeStepInfo.label}</strong>
        </div>
        <button type="button" onClick={() => setDetailOpen(false)}>
          닫기
        </button>
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
          <span>step</span>
          <strong>{passReady ? "완료" : `${currentStepIndex + 1}/5`}</strong>
        </div>
        <div>
          <span>hold</span>
          <strong>{Math.round(holdProgress * 100)}%</strong>
        </div>
        <div>
          <span>ready</span>
          <strong>{currentStepReady ? "OK" : "NO"}</strong>
        </div>
        <div>
          <span>blink</span>
          <strong>{blinkPhaseRef.current}</strong>
        </div>
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
        <div>
          <span>occ</span>
          <strong>{Math.round(metrics.occlusionScore * 100)}%</strong>
        </div>
        <div>
          <span>raw</span>
          <strong>{metrics.occlusionRawClear ? "OK" : "NO"}</strong>
        </div>
        <div>
          <span>jitter</span>
          <strong>{formatNumber(metrics.landmarkJitter, 4)}</strong>
        </div>
        <div>
          <span>mouth jit</span>
          <strong>{formatNumber(metrics.mouthJitter, 4)}</strong>
        </div>
        <div>
          <span>jit hits</span>
          <strong>{metrics.jitterSpikeCount}</strong>
        </div>
        <div>
          <span>mouth hits</span>
          <strong>{metrics.mouthJitterSpikeCount}</strong>
        </div>
        <div>
          <span>jit rate</span>
          <strong>{Math.round(metrics.jitterSpikeRatio * 100)}%</strong>
        </div>
        <div>
          <span>mouth rate</span>
          <strong>{Math.round(metrics.mouthJitterSpikeRatio * 100)}%</strong>
        </div>
      </div>

      <div className="liveness-steps">
        {steps.slice(0, 5).map((step, index) => {
          const done =
            step.id === "frontBlink"
              ? challenge.frontBlink
              : step.id === "right"
                ? challenge.right
                : step.id === "left"
                  ? challenge.left
                  : step.id === "down"
                    ? challenge.down
                    : challenge.up;
          const active = index === currentStepIndex && !passReady;
          return (
            <div key={step.id} className="liveness-step" data-active={active ? "true" : "false"} data-done={done ? "true" : "false"}>
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
            </div>
          );
        })}
      </div>

      <div className="liveness-result" data-pass={passReady ? "true" : "false"}>
        <strong>{passReady ? "검증 완료" : `${completedCount}/5 단계 완료`}</strong>
        <span>
          프로그레스바는 현재 스텝 진행률입니다. 정면은 blink 확인 후 3초, 다른 동작은 지정 방향으로 1.5초 유지해야 통과됩니다.
        </span>
      </div>
    </div>
  );

  return (
    <section className="liveness-shell" data-camera={cameraState}>
      <header className="liveness-topbar">
        <button type="button" className="liveness-back-button" aria-label="뒤로가기" onClick={() => window.history.back()}>
          ‹
        </button>
        <strong>Face ID 등록</strong>
        <button type="button" className="liveness-detail-button" onClick={() => setDetailOpen(true)}>
          Detail
        </button>
      </header>

      <div className="liveness-stage">
        <div className="liveness-camera" data-ring={ringState}>
          <video ref={videoRef} muted playsInline autoPlay />
          <canvas ref={overlayRef} className="liveness-overlay" />
          <div className="liveness-vignette" />
          <div className="liveness-visual-controls" aria-label="랜드마크 시각화 옵션">
            {VISUAL_LAYER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={visualLayers[option.id]}
                className="liveness-visual-chip"
                data-active={visualLayers[option.id] ? "true" : "false"}
                onClick={() => toggleVisualLayer(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {cameraState === "running" || cameraState === "requesting" ? <div className="liveness-face-guide" aria-hidden="true" /> : null}
          {cameraState === "idle" || cameraState === "failed" ? (
            <div className="liveness-idle">
              <div className="liveness-brand-mark">GT</div>
              <strong>
                Grab <span>Ticket</span>
              </strong>
              <p>Liveness UI/UX 프로토타입</p>
            </div>
          ) : null}
          <div className="liveness-prompt" aria-live="polite">
            <strong key={`${activeStep}-${isTransitioning}-${primaryInstruction}`}>{primaryInstruction}</strong>
          </div>
          <div className="liveness-progress" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="liveness-toast" data-visible={statusMessage ? "true" : "false"} role="status" aria-live="polite">
        {statusMessage}
      </div>

      <footer className="liveness-actions">
        <Button onClick={startCamera} disabled={cameraState === "requesting" || modelState === "loading"}>
          {actionLabel}
        </Button>
        <button type="button" className="liveness-reset-link" onClick={resetSession} disabled={cameraState !== "running"}>
          초기화
        </button>
      </footer>

      <aside className="liveness-sidebar" aria-label="라이브니스 상세 점수">
        {renderDetailPanel()}
      </aside>

      {detailOpen ? (
        <div className="liveness-detail-backdrop" role="dialog" aria-modal="true" aria-label="라이브니스 상세 점수" onClick={() => setDetailOpen(false)}>
          {renderDetailPanel()}
        </div>
      ) : null}
    </section>
  );
}
