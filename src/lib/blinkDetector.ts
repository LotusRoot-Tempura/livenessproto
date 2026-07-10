// 입장(키오스크) 얼굴 촬영용 눈 깜빡임 감지기.
//
// 정적 사진·화면 재현 공격은 눈을 깜빡일 수 없으므로, 촬영 전에 실제 깜빡임을
// 요구해 위조를 구조적으로 차단한다 (백엔드 안티스푸핑과 상호 보완).
// EAR(눈 세로/가로 비율) 기준은 등록 화면(FaceQualityCheck)과 동일:
// 눈 뜸(EAR > 0.21) → 감김(EAR < 0.195) 전이를 깜빡임 1회로 판정한다.

import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
const LEFT_EYE_TOP = 159;
const LEFT_EYE_BOTTOM = 145;
const RIGHT_EYE_TOP = 386;
const RIGHT_EYE_BOTTOM = 374;

const EAR_OPEN = 0.21;
const EAR_CLOSED = 0.195;

type Point = { x: number; y: number };

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(outer: Point, inner: Point, top: Point, bottom: Point) {
  const width = distance(outer, inner);
  if (width <= 0.0001) return 0;
  return distance(top, bottom) / width;
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const resolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );
      return vision.FaceLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    })().catch((error) => {
      landmarkerPromise = null; // 다음 시도에서 재로드
      throw error;
    });
  }
  return landmarkerPromise;
}

export type BlinkWatcher = { stop: () => void };

/**
 * video 프레임을 감시하다가 깜빡임 1회가 감지되면 onBlink 를 호출하고 멈춘다.
 * 모델 로드 실패 시 onError 호출 (호출측에서 fail-open 여부 결정).
 */
export function watchForBlink(
  video: HTMLVideoElement,
  onBlink: () => void,
  onError?: (error: unknown) => void,
): BlinkWatcher {
  let stopped = false;
  let rafId = 0;

  (async () => {
    let landmarker: FaceLandmarker;
    try {
      landmarker = await getLandmarker();
    } catch (error) {
      if (!stopped) onError?.(error);
      return;
    }
    if (stopped) return;

    let eyesWereOpen = false;
    let lastTs = -1;

    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const ts = performance.now();
        if (ts > lastTs) {
          lastTs = ts;
          try {
            const result = landmarker.detectForVideo(video, ts);
            const landmarks = result.faceLandmarks?.[0];
            if (landmarks) {
              const leftEar = eyeAspectRatio(
                landmarks[LEFT_EYE_OUTER], landmarks[LEFT_EYE_INNER],
                landmarks[LEFT_EYE_TOP], landmarks[LEFT_EYE_BOTTOM],
              );
              const rightEar = eyeAspectRatio(
                landmarks[RIGHT_EYE_OUTER], landmarks[RIGHT_EYE_INNER],
                landmarks[RIGHT_EYE_TOP], landmarks[RIGHT_EYE_BOTTOM],
              );
              const ear = (leftEar + rightEar) / 2;
              if (ear > EAR_OPEN) eyesWereOpen = true;
              if (eyesWereOpen && ear < EAR_CLOSED) {
                stopped = true;
                onBlink();
                return;
              }
            }
          } catch {
            // 개별 프레임 추론 실패는 무시하고 계속
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  })();

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
    },
  };
}
