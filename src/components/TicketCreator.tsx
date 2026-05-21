"use client";

import { FormEvent, useState } from "react";
import QRCode from "react-qr-code";
import { createTicket } from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";
import type { Ticket } from "@/types/models";

export function TicketCreator() {
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);
  const [latestTicket, setLatestTicket] = useState<Ticket | null>(null);
  const [form, setForm] = useState({ buyerId: "", eventName: "", eventDate: "", seatNo: "" });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.buyerId || !form.eventName || !form.eventDate || !form.seatNo) return;
    const next = createTicket(form);
    setLatestTicket(next);
    setForm({ buyerId: "", eventName: "", eventDate: "", seatNo: "" });
  };

  if (users.length === 0) {
    return <EmptyState title="먼저 이용자를 등록해 주세요." description="티켓 생성 전에 구매자 정보가 필요합니다." />;
  }

  return (
    <div className="list">
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="buyerId">구매자</label>
          <select id="buyerId" value={form.buyerId} onChange={(e) => setForm({ ...form, buyerId: e.target.value })}>
            <option value="">구매자를 선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} / {user.email}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="eventName">공연명</label>
          <input id="eventName" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="eventDate">공연일</label>
          <input id="eventDate" type="datetime-local" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="seatNo">좌석번호</label>
          <input id="seatNo" value={form.seatNo} onChange={(e) => setForm({ ...form, seatNo: e.target.value })} />
        </div>
        <Button type="submit">QR 티켓 생성</Button>
      </form>

      {latestTicket ? (
        <article className="panel">
          <strong>{latestTicket.eventName}</strong>
          <p className="helper-text">
            {formatDate(latestTicket.eventDate)} / {latestTicket.seatNo}
          </p>
          <div style={{ background: "white", padding: 16, borderRadius: 16, width: "fit-content" }}>
            <QRCode value={latestTicket.id} size={180} />
          </div>
          <p className="helper-text">QR에는 ticketId만 저장됩니다.</p>
          <p className="list-card__meta">생성일: {formatDateTime(latestTicket.createdAt)}</p>
        </article>
      ) : null}
    </div>
  );
}
