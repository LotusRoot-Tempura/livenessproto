"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import {
  createPerformance,
  deletePerformance,
  duplicatePerformance,
  updatePerformance,
  updatePerformanceStatus,
} from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import { useLocalData } from "@/hooks/useLocalData";
import type { Performance, PerformanceStatus } from "@/types/models";

const PERFORMANCE_STATUSES: PerformanceStatus[] = ["운영", "보류", "종료"];

function getPerformanceStatus(performance: Performance) {
  return performance.status ?? "운영";
}

function sanitizeSeatCount(value: string) {
  return value.replace(/\D/g, "");
}

export function PerformanceRegistration() {
  const { data: performances, refresh } = useLocalData(() => localStore.getPerformances(), [], []);
  const [form, setForm] = useState({
    eventName: "",
    eventDay: "",
    round1Time: "",
    round2Time: "",
    seatCount: "",
    artistName: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState({
    eventName: "",
    eventDay: "",
    eventTime: "",
    roundLabel: "1회차",
    seatCount: "",
    artistName: "",
    status: "운영" as PerformanceStatus,
  });
  const [pendingDelete, setPendingDelete] = useState<Performance | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedSeatCount = Number.parseInt(form.seatCount, 10);

    const rounds = [
      { label: "1회차", time: form.round1Time },
      { label: "2회차", time: form.round2Time },
    ].filter((round) => round.time);

    if (
      !form.eventName ||
      !form.eventDay ||
      !form.seatCount ||
      !form.artistName ||
      rounds.length === 0 ||
      !Number.isFinite(parsedSeatCount) ||
      parsedSeatCount < 1
    ) {
      return;
    }

    rounds.forEach((round) => {
      createPerformance({
        eventName: form.eventName,
        eventDate: `${form.eventDay}T${round.time}`,
        roundLabel: round.label,
        seatCount: parsedSeatCount,
        artistName: form.artistName,
      });
    });

    setForm({
      eventName: "",
      eventDay: "",
      round1Time: "",
      round2Time: "",
      seatCount: "",
      artistName: "",
    });
    refresh();
  };

  const startEditing = (performance: Performance) => {
    setEditingId(performance.id);
    setEditingForm({
      eventName: performance.eventName,
      eventDay: performance.eventDate.slice(0, 10),
      eventTime: performance.eventDate.slice(11, 16),
      roundLabel: performance.roundLabel ?? "1회차",
      seatCount: String(performance.seatCount),
      artistName: performance.artistName,
      status: getPerformanceStatus(performance),
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingForm({
      eventName: "",
      eventDay: "",
      eventTime: "",
      roundLabel: "1회차",
      seatCount: "",
      artistName: "",
      status: "운영",
    });
  };

  const saveEditing = (performanceId: string) => {
    const parsedSeatCount = Number.parseInt(editingForm.seatCount, 10);

    if (
      !editingForm.eventName ||
      !editingForm.eventDay ||
      !editingForm.eventTime ||
      !editingForm.seatCount ||
      !editingForm.artistName ||
      !Number.isFinite(parsedSeatCount) ||
      parsedSeatCount < 1
    ) {
      return;
    }

    updatePerformance(performanceId, {
      eventName: editingForm.eventName,
      eventDate: `${editingForm.eventDay}T${editingForm.eventTime}`,
      roundLabel: editingForm.roundLabel,
      seatCount: parsedSeatCount,
      artistName: editingForm.artistName,
      status: editingForm.status,
    });
    cancelEditing();
    refresh();
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deletePerformance(pendingDelete.id);
    setPendingDelete(null);
    refresh();
  };

  return (
    <>
      <div className="list">
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="eventName">공연명</label>
          <input
            id="eventName"
            value={form.eventName}
            onChange={(event) => setForm((current) => ({ ...current, eventName: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="eventDay">공연일</label>
          <input
            id="eventDay"
            type="date"
            value={form.eventDay}
            onChange={(event) => setForm((current) => ({ ...current, eventDay: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="round1Time">1회차 시간 등록</label>
          <input
            id="round1Time"
            type="time"
            value={form.round1Time}
            onChange={(event) => setForm((current) => ({ ...current, round1Time: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="round2Time">2회차 시간 등록</label>
          <input
            id="round2Time"
            type="time"
            value={form.round2Time}
            onChange={(event) => setForm((current) => ({ ...current, round2Time: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="seatCount">좌석수</label>
          <input
            id="seatCount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form.seatCount}
            onChange={(event) =>
              setForm((current) => ({ ...current, seatCount: sanitizeSeatCount(event.target.value) }))
            }
          />
        </div>

        <div className="field">
          <label htmlFor="artistName">가수명</label>
          <input
            id="artistName"
            value={form.artistName}
            onChange={(event) => setForm((current) => ({ ...current, artistName: event.target.value }))}
          />
        </div>

        <Button type="submit">공연 등록</Button>
      </form>

      {performances.length === 0 ? (
        <EmptyState
          title="등록된 공연이 없습니다"
          description="공연일과 회차 시간까지 등록하면 티켓구매에서 회차별로 선택할 수 있습니다."
        />
      ) : (
        performances.map((performance: Performance) => (
          <article key={performance.id} className="list-card">
            {editingId === performance.id ? (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`edit-eventName-${performance.id}`}>공연명</label>
                  <input
                    id={`edit-eventName-${performance.id}`}
                    value={editingForm.eventName}
                    onChange={(event) =>
                      setEditingForm((current) => ({ ...current, eventName: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-eventDay-${performance.id}`}>공연일</label>
                  <input
                    id={`edit-eventDay-${performance.id}`}
                    type="date"
                    value={editingForm.eventDay}
                    onChange={(event) =>
                      setEditingForm((current) => ({ ...current, eventDay: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-roundLabel-${performance.id}`}>회차</label>
                  <select
                    id={`edit-roundLabel-${performance.id}`}
                    value={editingForm.roundLabel}
                    onChange={(event) =>
                      setEditingForm((current) => ({ ...current, roundLabel: event.target.value }))
                    }
                  >
                    <option value="1회차">1회차</option>
                    <option value="2회차">2회차</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`edit-eventTime-${performance.id}`}>시간</label>
                  <input
                    id={`edit-eventTime-${performance.id}`}
                    type="time"
                    value={editingForm.eventTime}
                    onChange={(event) =>
                      setEditingForm((current) => ({ ...current, eventTime: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-seatCount-${performance.id}`}>좌석수</label>
                  <input
                    id={`edit-seatCount-${performance.id}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editingForm.seatCount}
                    onChange={(event) =>
                      setEditingForm((current) => ({
                        ...current,
                        seatCount: sanitizeSeatCount(event.target.value),
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-artistName-${performance.id}`}>가수명</label>
                  <input
                    id={`edit-artistName-${performance.id}`}
                    value={editingForm.artistName}
                    onChange={(event) =>
                      setEditingForm((current) => ({ ...current, artistName: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`edit-status-${performance.id}`}>상태</label>
                  <select
                    id={`edit-status-${performance.id}`}
                    value={editingForm.status}
                    onChange={(event) =>
                      setEditingForm((current) => ({
                        ...current,
                        status: event.target.value as PerformanceStatus,
                      }))
                    }
                  >
                    {PERFORMANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="button-row">
                  <Button type="button" onClick={() => saveEditing(performance.id)}>
                    저장
                  </Button>
                  <Button type="button" variant="secondary" onClick={cancelEditing}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <strong>{performance.eventName}</strong>
                <div className="list-card__meta">가수명: {performance.artistName}</div>
                <div className="list-card__meta">
                  공연일: {performance.eventDate.slice(0, 10)} / {performance.roundLabel ?? performance.eventDate.slice(11, 16)}
                </div>
                <div className="list-card__meta">시간: {performance.eventDate.slice(11, 16)}</div>
                <div className="list-card__meta">공연코드: {performance.shareCode ?? "-"}</div>
                <div className="list-card__meta">좌석수: {performance.seatCount}</div>
                <div className="field field--compact">
                  <label htmlFor={`status-${performance.id}`}>상태</label>
                  <select
                    id={`status-${performance.id}`}
                    value={getPerformanceStatus(performance)}
                    onChange={(event) => {
                      updatePerformanceStatus(performance.id, event.target.value as PerformanceStatus);
                      refresh();
                    }}
                  >
                    {PERFORMANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="button-row">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      duplicatePerformance(performance.id);
                      refresh();
                    }}
                  >
                    복사
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => startEditing(performance)}>
                    수정
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setPendingDelete(performance)}
                  >
                    삭제
                  </Button>
                </div>
                <div className="list-card__meta">등록일: {formatDateTime(performance.createdAt)}</div>
              </>
            )}
          </article>
        ))
      )}
      </div>

      {pendingDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="performance-delete-title">
          <div className="confirm-modal">
            <strong id="performance-delete-title">정말 삭제 하겠습니까?</strong>
            <p className="helper-text helper-text--tight">
              {pendingDelete.eventName} / {pendingDelete.roundLabel ?? pendingDelete.eventDate.slice(11, 16)}
            </p>
            <div className="button-row">
              <Button type="button" variant="danger" onClick={confirmDelete}>
                삭제
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)}>
                취소
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
