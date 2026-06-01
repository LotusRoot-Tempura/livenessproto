"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { createFaceProfile, deleteFaceProfile } from "@/lib/mock";
import { mediaDb } from "@/lib/db";
import { localStore } from "@/lib/storage";
import { blobToDataUrl, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FaceLandmarkOverlay } from "@/components/FaceLandmarkOverlay";
import type { FaceFeatureMetrics } from "@/components/FaceLandmarkOverlay";
import { FaceQualityCheck } from "@/components/FaceQualityCheck";
import { StatusCard } from "@/components/StatusCard";
import { useLocalData } from "@/hooks/useLocalData";

const SNAPSHOT_GUIDES = [
  "정면 기본",
  "오른쪽: 코 끝이 조금 옆으로",
  "오른쪽: 볼선이 더 많이 보이게",
  "왼쪽: 코 끝이 조금 옆으로",
  "왼쪽: 볼선이 더 많이 보이게",
  "턱 약간 위",
  "턱 약간 아래",
];

const ORDINAL_LABELS = [
  "첫번째",
  "두번째",
  "세번째",
  "네번째",
  "다섯번째",
  "여섯번째",
  "일곱번째",
];

const COUNTDOWN_START = 3;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

type CaptureMode = "idle" | "sequence" | "retake";

const EMPTY_FACE_FEATURE_METRICS: FaceFeatureMetrics = {
  pointValues: [],
  lineValues: [],
  pointTotal: 0,
  lineTotal: 0,
  total: 0,
};

export function FaceRegistrationFlow() {
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);
  const { data: profiles, refresh } = useLocalData(() => localStore.getFaceProfiles(), [], []);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("이용자를 선택하고 카메라를 준비해 주세요.");
  const [errorMessage, setErrorMessage] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [snapshotBlobIds, setSnapshotBlobIds] = useState<string[]>([]);
  const [snapshotPreviewUrls, setSnapshotPreviewUrls] = useState<string[]>([]);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [selectedRetakeIndex, setSelectedRetakeIndex] = useState<number | null>(null);
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [submittedUserId, setSubmittedUserId] = useState("");
  const [pendingDeleteProfileId, setPendingDeleteProfileId] = useState<string | null>(null);
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [faceFeatureMetrics, setFaceFeatureMetrics] = useState<FaceFeatureMetrics>(EMPTY_FACE_FEATURE_METRICS);
  const [faceFeatureMetricsStatus, setFaceFeatureMetricsStatus] = useState<"idle" | "sampling" | "locked">("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      audioContextRef.current?.close().catch(() => undefined);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const selectedUserName = useMemo(
    () => users.find((user) => user.id === selectedUserId)?.name ?? "",
    [selectedUserId, users],
  );

  const currentGuideIndex = selectedRetakeIndex ?? stepIndex;
  const currentGuide = SNAPSHOT_GUIDES[Math.min(currentGuideIndex, SNAPSHOT_GUIDES.length - 1)];
  const nextGuide =
    currentGuideIndex + 1 < SNAPSHOT_GUIDES.length ? SNAPSHOT_GUIDES[currentGuideIndex + 1] : "마지막 포즈";
  const isBusy = captureMode !== "idle";
  const canSave = sequenceComplete && snapshotBlobIds.length === SNAPSHOT_GUIDES.length && !profileSaved;
  const samplePoses = [
    {
      label: SNAPSHOT_GUIDES[0],
      description: "얼굴을 정면으로 두고 카메라를 바로 바라봐 주세요.",
      imageSrc: "/sample-poses/01-front.png",
    },
    {
      label: SNAPSHOT_GUIDES[1],
      description: "얼굴을 오른쪽으로 조금 돌려 코 끝 방향이 살짝 옆으로 보이게 해 주세요.",
      imageSrc: "/sample-poses/02-right-nose.png",
    },
    {
      label: SNAPSHOT_GUIDES[2],
      description: "얼굴을 오른쪽으로 더 돌려 볼선이 분명하게 보이게 해 주세요.",
      imageSrc: "/sample-poses/03-right-cheek.png",
    },
    {
      label: SNAPSHOT_GUIDES[3],
      description: "얼굴을 왼쪽으로 조금 돌려 코 끝 방향이 살짝 옆으로 보이게 해 주세요.",
      imageSrc: "/sample-poses/04-left-nose.png",
    },
    {
      label: SNAPSHOT_GUIDES[4],
      description: "얼굴을 왼쪽으로 더 돌려 볼선이 분명하게 보이게 해 주세요.",
      imageSrc: "/sample-poses/05-left-cheek.png",
    },
    {
      label: SNAPSHOT_GUIDES[5],
      description: "턱을 살짝 들어 이마와 코 라인이 더 드러나게 해 주세요.",
      imageSrc: "/sample-poses/06-chin-up.png",
    },
    {
      label: SNAPSHOT_GUIDES[6],
      description: "턱을 살짝 내려 눈매와 턱선이 또렷하게 보이게 해 주세요.",
      imageSrc: "/sample-poses/07-chin-down.png",
    },
  ] as const;

  const ensureAudioReady = async () => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }
      setAudioReady(true);
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    setAudioReady(true);
  };

  const speak = async (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ko-KR";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  };

  const playTone = async (
    frequency: number,
    durationMs: number,
    type: OscillatorType = "sine",
    gainValue = 0.08,
  ) => {
    await ensureAudioReady();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  };

  const playCountdownBeep = async (count: number) => {
    const frequency = count === 1 ? 980 : 740;
    await playTone(frequency, 180, "sine", 0.06);
  };

  const playShutterSound = async () => {
    await playTone(1200, 80, "square", 0.08);
    await wait(50);
    await playTone(600, 120, "triangle", 0.06);
  };

  const playCompleteSound = async () => {
    await playTone(660, 140, "triangle", 0.06);
    await wait(80);
    await playTone(880, 180, "triangle", 0.06);
  };

  const resetSession = () => {
    cancelledRef.current = true;
    window.speechSynthesis?.cancel();
    setCaptureMode("idle");
    setCountdown(null);
    setStepIndex(0);
    setSnapshotBlobIds([]);
    setSnapshotPreviewUrls([]);
    setProfileSaved(false);
    setIsCapturingFrame(false);
    setSelectedRetakeIndex(null);
    setSequenceComplete(false);
    setSubmittedUserId("");
    setStatusMessage("새 촬영 세션을 시작할 수 있습니다.");
    setErrorMessage("");
  };

  const stopCapture = () => {
    cancelledRef.current = true;
    window.speechSynthesis?.cancel();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setCaptureMode("idle");
    setCountdown(null);
    setStatusMessage("촬영이 중단되었습니다.");
  };

  const startCamera = async () => {
    setErrorMessage("");
    setStatusMessage("카메라 권한을 요청하는 중입니다.");

    try {
      await ensureAudioReady();
      streamRef.current?.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
      setStatusMessage(`카메라 준비 완료. "${SNAPSHOT_GUIDES[0]}" 포즈를 맞춘 뒤 자동 촬영을 시작해 주세요.`);
      void speak("카메라 준비가 완료되었습니다. 자동 촬영 시작 버튼을 눌러 주세요.");
    } catch (error) {
      setCameraReady(false);
      setErrorMessage("카메라를 시작하지 못했습니다. 브라우저 권한과 HTTPS 또는 localhost 환경을 확인해 주세요.");
      setStatusMessage("카메라 준비 실패");
      console.error(error);
    }
  };

  const captureBlob = async () => {
    if (!videoRef.current || !canvasRef.current) {
      throw new Error("capture target not ready");
    }

    setIsCapturingFrame(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setIsCapturingFrame(false);
      throw new Error("canvas context unavailable");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));

    if (!blob) {
      setIsCapturingFrame(false);
      throw new Error("snapshot generation failed");
    }

    setIsCapturingFrame(false);
    return blob;
  };

  const runCountdownForGuide = async (guideLabel: string, guideIndex: number) => {
    setStepIndex(guideIndex);
    await speak(`${ORDINAL_LABELS[guideIndex]} 포즈. ${guideLabel}. 자세를 맞춰 주세요.`);

    for (let count = COUNTDOWN_START; count >= 1; count -= 1) {
      if (cancelledRef.current) throw new Error("sequence cancelled");
      setCountdown(count);
      setStatusMessage(`${guideIndex + 1}단계 "${guideLabel}" 포즈를 유지해 주세요. ${count}초 뒤 촬영합니다.`);
      void playCountdownBeep(count);
      await wait(1000);
    }

    setCountdown(null);
  };

  const startAutoSequence = async () => {
    setErrorMessage("");

    if (!selectedUserId) {
      setErrorMessage("먼저 이용자를 선택해 주세요.");
      return;
    }

    if (!streamRef.current || !videoRef.current || !canvasRef.current) {
      setErrorMessage("카메라가 준비되지 않았습니다. 먼저 촬영 시작 준비를 눌러 주세요.");
      return;
    }

    if (isBusy) return;

    await ensureAudioReady();
    cancelledRef.current = false;
    setCaptureMode("sequence");
    setCountdown(null);
    setStepIndex(0);
    setSnapshotBlobIds([]);
    setSnapshotPreviewUrls([]);
    setProfileSaved(false);
    setSelectedRetakeIndex(null);
    setSequenceComplete(false);
    setStatusMessage("자동 촬영을 시작합니다.");

    const capturedBlobIds: string[] = [];
    const previewUrls: string[] = [];

    try {
      await speak("지금부터 자동 촬영을 시작합니다. 포즈 안내에 맞춰 얼굴 방향을 바꿔 주세요.");

      for (let step = 0; step < SNAPSHOT_GUIDES.length; step += 1) {
        if (cancelledRef.current) throw new Error("sequence cancelled");

        await runCountdownForGuide(SNAPSHOT_GUIDES[step], step);
        setStatusMessage(`${step + 1}단계 촬영 중입니다.`);
        await playShutterSound();
        await speak("촬영합니다.");
        const blob = await captureBlob();
        const blobId = uuid();
        await mediaDb.saveImage(blobId, blob);
        const previewUrl = await blobToDataUrl(blob);
        capturedBlobIds.push(blobId);
        previewUrls.push(previewUrl);
        setSnapshotBlobIds([...capturedBlobIds]);
        setSnapshotPreviewUrls([...previewUrls]);

        if (step < SNAPSHOT_GUIDES.length - 1) {
          setStatusMessage(`${step + 1}단계 촬영 완료. 다음 포즈를 준비해 주세요.`);
          await speak("촬영 완료. 다음 포즈를 준비해 주세요.");
          await wait(450);
        }
      }

      setSequenceComplete(true);
      setStatusMessage("7장 촬영 완료. 필요한 사진만 다시 촬영하거나 최종 저장해 주세요.");
      await playCompleteSound();
      await speak("모든 촬영이 완료되었습니다. 재촬영 포즈가 있으면 선택해서 진행해 주셔도 됩니다.");
    } catch (error) {
      if (!cancelledRef.current) {
        setErrorMessage("자동 촬영 중 문제가 발생했습니다. 다시 시도해 주세요.");
        console.error(error);
      } else {
        setStatusMessage("촬영이 중단되었습니다.");
      }
    } finally {
      setCountdown(null);
      setCaptureMode("idle");
      cancelledRef.current = false;
    }
  };

  const startRetake = async () => {
    if (selectedRetakeIndex === null) {
      setErrorMessage("다시 촬영할 위치를 먼저 선택해 주세요.");
      return;
    }

    if (!streamRef.current || !videoRef.current || !canvasRef.current) {
      setErrorMessage("카메라가 준비되지 않았습니다. 먼저 촬영 시작 준비를 눌러 주세요.");
      return;
    }

    if (isBusy) return;

    await ensureAudioReady();
    cancelledRef.current = false;
    setCaptureMode("retake");
    setErrorMessage("");

    try {
      await speak(`${ORDINAL_LABELS[selectedRetakeIndex]} 사진을 다시 촬영합니다.`);
      await runCountdownForGuide(SNAPSHOT_GUIDES[selectedRetakeIndex], selectedRetakeIndex);
      setStatusMessage(`${selectedRetakeIndex + 1}번 사진을 다시 촬영합니다.`);
      await playShutterSound();
      await speak("촬영합니다.");
      const blob = await captureBlob();
      const blobId = uuid();
      await mediaDb.saveImage(blobId, blob);
      const previewUrl = await blobToDataUrl(blob);

      setSnapshotBlobIds((prev) => prev.map((item, index) => (index === selectedRetakeIndex ? blobId : item)));
      setSnapshotPreviewUrls((prev) => prev.map((item, index) => (index === selectedRetakeIndex ? previewUrl : item)));
      setStatusMessage(`${selectedRetakeIndex + 1}번 사진이 업데이트되었습니다.`);
      await speak("선택한 사진이 업데이트되었습니다.");
    } catch (error) {
      if (!cancelledRef.current) {
        setErrorMessage("재촬영 중 문제가 발생했습니다. 다시 시도해 주세요.");
        console.error(error);
      } else {
        setStatusMessage("재촬영이 중단되었습니다.");
      }
    } finally {
      setCountdown(null);
      setCaptureMode("idle");
      cancelledRef.current = false;
    }
  };

  const saveProfile = async () => {
    if (!selectedUserId) {
      setErrorMessage("먼저 이용자를 선택해 주세요.");
      return;
    }

    if (!canSave) {
      setErrorMessage("7장 촬영을 완료한 뒤 최종 저장할 수 있습니다.");
      return;
    }

    createFaceProfile(selectedUserId, snapshotBlobIds);
    refresh();
    setProfileSaved(true);
    setStatusMessage(`${selectedUserName || "선택한 이용자"}의 베스트 스냅샷 7장이 등록되었습니다.`);
    await playCompleteSound();
    await speak("최종 저장이 완료되었습니다.");
  };

  const submitSelection = () => {
    if (!selectedUserId) {
      setErrorMessage("먼저 이용자를 선택해 주세요.");
      return;
    }
    setSubmittedUserId(selectedUserId);
    setStatusMessage("제출이 완료되었습니다.");
  };

  const removeProfile = (faceProfileId: string) => {
    deleteFaceProfile(faceProfileId);
    refresh();
    setPendingDeleteProfileId(null);
  };

  return (
    <div className="list list--compact">
      <div className="panel panel--compact face-register-summary">
        <div className="face-register-summary__top">
          <strong>빠른 등록</strong>
          <span className="face-register-summary__count">
            {snapshotBlobIds.length}/{SNAPSHOT_GUIDES.length}
          </span>
        </div>
        <p className="helper-text helper-text--tight">{statusMessage}</p>
        <div className="inline-meta">
          <span className="badge" data-tone={cameraReady ? "success" : "warning"}>
            {cameraReady ? "카메라 준비됨" : "카메라 준비 필요"}
          </span>
          <span className="badge" data-tone={sequenceComplete ? "success" : "info"}>
            {sequenceComplete ? "검토 가능" : "자동 촬영 전"}
          </span>
          <span className="badge" data-tone={audioReady ? "success" : "warning"}>
            {audioReady ? "오디오 준비됨" : "오디오 대기"}
          </span>
        </div>
      </div>

      {errorMessage ? <StatusCard title="오류 안내" description={errorMessage} tone="danger" /> : null}

      <div className="panel panel--compact face-register-controls">
        <div className="field field--compact">
          <label htmlFor="userId">이용자 선택</label>
          <select
            id="userId"
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              resetSession();
            }}
          >
            <option value="">이용자를 선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} / {user.phone}
              </option>
            ))}
          </select>
        </div>

        <div className="button-row button-row--dense">
          <Button onClick={startCamera} disabled={!selectedUserId || cameraReady || isBusy}>
            준비
          </Button>
          <Button onClick={startAutoSequence} disabled={!cameraReady || !selectedUserId || isBusy}>
            {captureMode === "sequence" ? "진행 중" : "자동촬영"}
          </Button>
        </div>

        <div className="button-row button-row--dense">
          <Button onClick={startRetake} disabled={!sequenceComplete || selectedRetakeIndex === null || isBusy}>
            {captureMode === "retake" ? "재촬영 중" : "선택 재촬영"}
          </Button>
          <Button onClick={saveProfile} disabled={!canSave || isBusy}>
            {profileSaved ? "저장 완료" : "최종 저장"}
          </Button>
        </div>

        <div className="button-row button-row--dense">
          <Button variant="secondary" onClick={() => setSampleModalOpen(true)}>
            샘플보기
          </Button>
          <Button onClick={stopCapture} variant="danger" disabled={!cameraReady && !isBusy}>
            중단
          </Button>
          <Button onClick={resetSession} variant="secondary">
            초기화
          </Button>
        </div>
      </div>

      <div className="face-register-layout face-register-layout--compact">
        <div className="face-register-visuals">
          <div className="camera-frame camera-frame--compact camera-frame--overlay">
            <video ref={videoRef} muted playsInline />
            <FaceLandmarkOverlay
              videoRef={videoRef}
              onMetricsChange={setFaceFeatureMetrics}
              onMetricsStatusChange={setFaceFeatureMetricsStatus}
            />
            <div className="camera-overlay">
              <div className="camera-overlay__top">
                <div className="camera-overlay__guide">
                  <span className="camera-overlay__label">현재</span>
                  <strong>{currentGuide}</strong>
                </div>
                <div className="camera-overlay__guide camera-overlay__guide--right">
                  <span className="camera-overlay__label">다음</span>
                  <strong>{nextGuide}</strong>
                </div>
              </div>
              {countdown !== null ? <div className="camera-overlay__count">{countdown}</div> : null}
              {isCapturingFrame ? <div className="camera-overlay__flash">찰칵</div> : null}
            </div>
          </div>
          <div className="panel panel--compact">
            <div className="face-feature-metrics">
              <strong>얼굴 특징 수치</strong>
              <div className="list-card__meta">점 {faceFeatureMetrics.pointValues.length}개 합계: {faceFeatureMetrics.pointTotal}</div>
              <div className="list-card__meta">선 {faceFeatureMetrics.lineValues.length}개 합계: {faceFeatureMetrics.lineTotal}</div>
              <div className="list-card__meta">총합: {faceFeatureMetrics.total}</div>
              <div className="list-card__meta">
                상태: {faceFeatureMetricsStatus === "sampling" ? "측정 중..." : faceFeatureMetricsStatus === "locked" ? "평균 확정" : "대기 중"}
              </div>
              <div className="helper-text helper-text--tight">점 위치와 연결선 길이를 얼굴 비율 기준으로 환산한 실측형 수치입니다.</div>
            </div>
          </div>
          <FaceQualityCheck videoRef={videoRef} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      </div>

      <div className="panel panel--compact">
        <div className="face-register-summary__top">
          <strong>재촬영 선택</strong>
          <span className="helper-text helper-text--tight">
            {selectedRetakeIndex !== null ? `${selectedRetakeIndex + 1}번 선택됨` : "선택 없음"}
          </span>
        </div>
        <div className="snapshot-grid snapshot-grid--compact">
          {SNAPSHOT_GUIDES.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`snapshot-card snapshot-card--selectable ${selectedRetakeIndex === index ? "snapshot-card--active" : ""}`}
              onClick={() => setSelectedRetakeIndex(index)}
              disabled={!sequenceComplete}
            >
              <div className="snapshot-card__label">
                {index + 1}. {label}
              </div>
              {snapshotPreviewUrls[index] ? (
                <img src={snapshotPreviewUrls[index]} alt={label} className="snapshot-card__image" />
              ) : (
                <div className="snapshot-card__empty">대기</div>
              )}
            </button>
          ))}
        </div>
        <div className="button-row button-row--dense face-register-submit-row">
          <Button onClick={submitSelection} disabled={snapshotBlobIds.length !== SNAPSHOT_GUIDES.length}>
            제출
          </Button>
        </div>
        {submittedUserId ? (
          <div className="face-register-submitted">
            <strong>제출된 사용자 ID</strong>
            <div className="list-card__meta">{submittedUserId}</div>
          </div>
        ) : null}
      </div>

      <div className="list list--compact">
        {profiles.length === 0 ? (
          <EmptyState title="등록된 얼굴 세트가 없습니다." description="이용자를 선택한 뒤 자동 촬영을 시작해 주세요." />
        ) : (
          profiles.map((profile) => (
            <article key={profile.id} className="list-card list-card--compact">
              <strong>사용자 ID: {profile.userId}</strong>
              <div className="inline-meta">
                <span className="badge" data-tone="success">
                  {(profile.snapshotBlobIds ?? []).length}장
                </span>
                <span className="badge" data-tone="info">
                  {profile.status}
                </span>
              </div>
              <div className="list-card__meta">등록일: {formatDateTime(profile.createdAt)}</div>
              <div className="face-register-card-actions">
                <button
                  type="button"
                  className="ghost-danger-button"
                  onClick={() => setPendingDeleteProfileId(profile.id)}
                >
                  삭제
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {pendingDeleteProfileId ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <strong id="delete-confirm-title">정말 삭제하시겠습니까?</strong>
            <p className="helper-text helper-text--tight">삭제하면 이 얼굴 등록 세트는 목록에서 사라집니다.</p>
            <div className="button-row button-row--dense">
              <Button variant="secondary" onClick={() => setPendingDeleteProfileId(null)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => removeProfile(pendingDeleteProfileId)}>
                삭제
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {sampleModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="sample-modal" role="dialog" aria-modal="true" aria-labelledby="sample-modal-title">
            <div className="sample-modal__header">
              <strong id="sample-modal-title">포즈 샘플 보기</strong>
              <button
                type="button"
                className="ghost-close-button"
                onClick={() => setSampleModalOpen(false)}
                aria-label="샘플 팝업 닫기"
              >
                닫기
              </button>
            </div>
            <p className="helper-text helper-text--tight">
              위에서 내려다보는 기준으로 얼굴 방향을 맞춰 주세요. 코 끝 방향과 볼선 노출 정도를 보고 따라 하면 됩니다.
            </p>
            <div className="sample-grid">
              {samplePoses.map((pose, index) => (
                <div key={pose.label} className="sample-card">
                  <div className="sample-card__image-wrap">
                    <img
                      src={pose.imageSrc}
                      alt={`${index + 1}번 샘플 포즈`}
                      className="sample-card__image"
                    />
                  </div>
                  <div className="sample-card__index">{index + 1}</div>
                  <div className="sample-card__label">{pose.label}</div>
                  <div className="sample-card__description">{pose.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
