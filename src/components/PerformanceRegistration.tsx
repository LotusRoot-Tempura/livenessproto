"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { createPerformance } from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import { useLocalData } from "@/hooks/useLocalData";
import type { Performance } from "@/types/models";

export function PerformanceRegistration() {
  const { data: performances, refresh } = useLocalData(() => localStore.getPerformances(), [], []);
  const [form, setForm] = useState({
    eventName: "",
    eventDate: "",
    seatCount: "",
    artistName: "",
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.eventName || !form.eventDate || !form.seatCount || !form.artistName) {
      return;
    }

    createPerformance({
      eventName: form.eventName,
      eventDate: form.eventDate,
      seatCount: Number(form.seatCount),
      artistName: form.artistName,
    });

    setForm({
      eventName: "",
      eventDate: "",
      seatCount: "",
      artistName: "",
    });
    refresh();
  };

  return (
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
          <label htmlFor="eventDate">공연일</label>
          <input
            id="eventDate"
            type="datetime-local"
            value={form.eventDate}
            onChange={(event) => setForm((current) => ({ ...current, eventDate: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="seatCount">좌석수</label>
          <input
            id="seatCount"
            type="number"
            min="1"
            value={form.seatCount}
            onChange={(event) => setForm((current) => ({ ...current, seatCount: event.target.value }))}
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
          description="공연명, 공연일, 좌석수, 가수명을 먼저 등록해 주세요."
        />
      ) : (
        performances.map((performance: Performance) => (
          <article key={performance.id} className="list-card">
            <strong>{performance.eventName}</strong>
            <div className="list-card__meta">가수명: {performance.artistName}</div>
            <div className="list-card__meta">공연일: {performance.eventDate}</div>
            <div className="list-card__meta">좌석수: {performance.seatCount}</div>
            <div className="list-card__meta">등록일: {formatDateTime(performance.createdAt)}</div>
          </article>
        ))
      )}
    </div>
  );
}
