"use client";

import QRCode from "react-qr-code";
import { localStore } from "@/lib/storage";
import { formatDateTime, isTransferAllowed } from "@/lib/utils";
import { transferTicketHolder } from "@/lib/mock";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";

export function TicketList() {
  const { data: tickets, refresh } = useLocalData(() => localStore.getTickets(), [], []);
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);
  const { data: transfers } = useLocalData(() => localStore.getTransfers(), [], []);

  const getUserName = (id: string) => users.find((user) => user.id === id)?.name ?? "알 수 없음";

  if (tickets.length === 0) {
    return <EmptyState title="생성된 티켓이 없습니다." description="티켓 생성 화면에서 먼저 QR 티켓을 만드세요." />;
  }

  return (
    <div className="list">
      {tickets.map((ticket) => {
        const allowed = isTransferAllowed(ticket.eventDate);
        const history = transfers.filter((item) => item.ticketId === ticket.id);
        return (
          <article key={ticket.id} className="list-card">
            <strong>{ticket.eventName}</strong>
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
                      // 테스트 시점 확인을 위해 실제 제한 로직은 유지합니다.
                      // 필요하면 아래 allowed 체크를 주석 처리해 우회 테스트할 수 있습니다.
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
  );
}
