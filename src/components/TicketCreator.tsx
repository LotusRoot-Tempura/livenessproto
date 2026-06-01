"use client";

import { FormEvent, useState } from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";
import { createTicket } from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Ticket } from "@/types/models";

export function TicketCreator() {
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);
  const { data: performances } = useLocalData(() => localStore.getPerformances(), [], []);
  const [latestTicket, setLatestTicket] = useState<Ticket | null>(null);
  const [form, setForm] = useState({
    buyerId: "",
    performanceId: "",
    eventName: "",
    eventDate: "",
    seatNo: "",
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.buyerId || !form.performanceId || !form.eventName || !form.eventDate || !form.seatNo) {
      return;
    }

    const next = createTicket({
      buyerId: form.buyerId,
      performanceId: form.performanceId,
      eventName: form.eventName,
      eventDate: form.eventDate,
      seatNo: form.seatNo,
    });
    setLatestTicket(next);
    setForm({
      buyerId: "",
      performanceId: "",
      eventName: "",
      eventDate: "",
      seatNo: "",
    });
  };

  if (users.length === 0) {
    return <EmptyState title="먼저 이용자를 등록해 주세요" description="티켓 생성 전에 구매자 정보가 필요합니다." />;
  }

  if (performances.length === 0) {
    return (
      <EmptyState
        title="먼저 공연을 등록해 주세요"
        description="공연등록 탭에서 공연 정보를 등록하면 티켓 생성에서 선택할 수 있습니다."
      />
    );
  }

  return (
    <div className="list">
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="buyerId">구매자</label>
          <select
            id="buyerId"
            value={form.buyerId}
            onChange={(event) => setForm((current) => ({ ...current, buyerId: event.target.value }))}
          >
            <option value="">구매자를 선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} / {user.email}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="performanceId">공연 선택</label>
          <select
            id="performanceId"
            value={form.performanceId}
            onChange={(event) => {
              const performance = performances.find((item) => item.id === event.target.value);

              setForm((current) => ({
                ...current,
                performanceId: event.target.value,
                eventName: performance?.eventName ?? "",
                eventDate: performance?.eventDate ?? "",
              }));
            }}
          >
            <option value="">공연을 선택하세요</option>
            {performances.map((performance) => (
              <option key={performance.id} value={performance.id}>
                {performance.eventName} / {performance.artistName}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="seatNo">좌석번호</label>
          <input
            id="seatNo"
            value={form.seatNo}
            onChange={(event) => setForm((current) => ({ ...current, seatNo: event.target.value }))}
          />
        </div>

        <Button type="submit">QR 티켓 생성</Button>
      </form>

      {latestTicket ? (
        <article className="panel">
          <strong>{latestTicket.eventName}</strong>
          <p className="helper-text">
            {formatDate(latestTicket.eventDate)} / {latestTicket.seatNo}
          </p>
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 16, width: "fit-content" }}>
            <QRCode value={latestTicket.id} size={180} />
          </div>
          <p className="helper-text">QR에는 ticketId만 포함됩니다.</p>
          <p className="list-card__meta">생성일: {formatDateTime(latestTicket.createdAt)}</p>
        </article>
      ) : null}
    </div>
  );
}
