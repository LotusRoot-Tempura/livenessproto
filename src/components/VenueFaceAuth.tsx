"use client";

import { useMemo, useState } from "react";
import { localStore } from "@/lib/storage";
import { EmptyState } from "@/components/EmptyState";
import { FaceCaptureVerifier } from "@/components/FaceCaptureVerifier";
import { useLocalData } from "@/hooks/useLocalData";

export function VenueFaceAuth() {
  const { data: tickets } = useLocalData(() => localStore.getTickets(), [], []);
  const [selectedTicketId, setSelectedTicketId] = useState("");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets],
  );

  if (tickets.length === 0) {
    return <EmptyState title="인증할 티켓이 없습니다." description="먼저 티켓을 생성한 뒤 얼굴 인증을 진행해 주세요." />;
  }

  return (
    <div className="list">
      <div className="panel field">
        <label htmlFor="face-auth-ticket">대상 티켓 선택</label>
        <select
          id="face-auth-ticket"
          value={selectedTicket?.id ?? ""}
          onChange={(event) => setSelectedTicketId(event.target.value)}
        >
          {tickets.map((ticket) => (
            <option key={ticket.id} value={ticket.id}>
              {ticket.eventName} / {ticket.seatNo}
            </option>
          ))}
        </select>
      </div>
      {selectedTicket ? <FaceCaptureVerifier ticket={selectedTicket} /> : null}
    </div>
  );
}
