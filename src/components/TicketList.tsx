"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { localStore } from "@/lib/storage";
import { formatDateTime, isTransferAllowed } from "@/lib/utils";
import { deleteTicket, transferTicketHolder } from "@/lib/mock";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";
import type { Ticket } from "@/types/models";

export function TicketList() {
  const { data: tickets, refresh } = useLocalData(() => localStore.getTickets(), [], []);
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);
  const { data: transfers } = useLocalData(() => localStore.getTransfers(), [], []);
  const [pendingDelete, setPendingDelete] = useState<Ticket | null>(null);

  const getUserName = (id: string) => users.find((user) => user.id === id)?.name ?? "알 수 없음";

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteTicket(pendingDelete.id);
    setPendingDelete(null);
    refresh();
  };

  if (tickets.length === 0) {
    return <EmptyState title="생성된 티켓이 없습니다." description="티켓 생성 화면에서 먼저 QR 티켓을 만드세요." />;
  }

  return (
    <>
      <div className="list">
        {tickets.map((ticket) => {
          const allowed = isTransferAllowed(ticket.eventDate);
          const history = transfers.filter((item) => item.ticketId === ticket.id);
          return (
            <article key={ticket.id} className="list-card">
              <strong>{ticket.eventName}</strong>
              <div className="list-card__meta">티켓번호: {ticket.id}</div>
              <div className="badge-row">
                <Badge tone="info">좌석 {ticket.seatNo}</Badge>
                <Badge tone={ticket.status === "active" ? "success" : "warning"}>{ticket.status}</Badge>
              </div>
              <div className="list-card__meta">구매자: {getUserName(ticket.buyerId)}</div>
              <div className="list-card__meta">입장자: {getUserName(ticket.holderUserId)}</div>
              <div className="list-card__meta">공연일: {formatDateTime(ticket.eventDate)}</div>
              <p className="helper-text">
                정책상 공연 24시간 전까지만 변경 가능하며, 현재 {allowed ? "변경 가능" : "변경 제한"} 상태입니다.
              </p>
              <div className="button-row">
                {users
                  .filter((user) => user.id !== ticket.holderUserId)
                  .slice(0, 2)
                  .map((user) => (
                    <Button
                      key={user.id}
                      variant="secondary"
                      onClick={() => {
                        if (!allowed) return;
                        transferTicketHolder(ticket.id, user.id);
                        refresh();
                      }}
                      disabled={!allowed}
                    >
                      {user.name}로 변경
                    </Button>
                  ))}
              </div>
              <div className="button-row">
                <Button type="button" variant="danger" onClick={() => setPendingDelete(ticket)}>
                  삭제
                </Button>
              </div>
              <div style={{ background: "white", padding: 12, borderRadius: 12, width: "fit-content" }}>
                <QRCode value={ticket.id} size={120} />
              </div>
              {history.map((item) => (
                <div key={item.id} className="list-card__meta">
                  변경 이력: {getUserName(item.fromHolderUserId)} → {getUserName(item.toHolderUserId)} / {formatDateTime(item.changedAt)}
                </div>
              ))}
            </article>
          );
        })}
      </div>

      {pendingDelete ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ticket-delete-title">
          <div className="confirm-modal">
            <strong id="ticket-delete-title">정말 삭제하시겠습니까?</strong>
            <p className="helper-text helper-text--tight">
              {pendingDelete.eventName} / 좌석 {pendingDelete.seatNo}
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
