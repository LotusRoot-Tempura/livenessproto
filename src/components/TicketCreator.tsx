"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";
import { getCurrentUserAccount } from "@/lib/auth";
import { MAX_TICKETS_PER_BUYER_PER_PERFORMANCE, createTicketsForPurchase } from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Performance, Ticket } from "@/types/models";

function extractSeatSequence(seatNo: string) {
  const match = seatNo.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getNextAvailableSeatNumbers(performance: Performance | undefined, tickets: Ticket[], quantity: number) {
  if (!performance || quantity <= 0) return [];

  const takenSeats = new Set(
    tickets
      .filter((ticket) => ticket.performanceId === performance.id)
      .map((ticket) => extractSeatSequence(ticket.seatNo))
      .filter((seatNo): seatNo is number => seatNo !== null),
  );

  const seatNumbers: number[] = [];
  for (let seat = 1; seat <= performance.seatCount; seat += 1) {
    if (takenSeats.has(seat)) continue;
    seatNumbers.push(seat);
    if (seatNumbers.length === quantity) break;
  }

  return seatNumbers;
}

function getEventDayKey(eventDate: string) {
  return eventDate.slice(0, 10);
}

function getRoundLabel(performance: Performance) {
  const time = performance.eventDate.slice(11, 16);
  return performance.roundLabel ? `${performance.roundLabel} ${time}` : time || performance.eventDate;
}

function getRoundOrder(performance: Performance) {
  if (performance.roundLabel?.startsWith("1회차")) return 1;
  if (performance.roundLabel?.startsWith("2회차")) return 2;
  return 99;
}

export function TicketCreator() {
  const { data: performances } = useLocalData(() => localStore.getPerformances(), [], []);
  const { data: faceProfiles } = useLocalData(() => localStore.getFaceProfiles(), [], []);
  const { data: tickets, refresh: refreshTickets } = useLocalData(() => localStore.getTickets(), [], []);
  const currentUser = getCurrentUserAccount();
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    eventName: "",
    eventDay: "",
    performanceId: "",
    quantity: "1",
  });

  const eventNames = useMemo(
    () => Array.from(new Set(performances.map((performance) => performance.eventName))),
    [performances],
  );

  const dateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          performances
            .filter((performance) => performance.eventName === form.eventName)
            .map((performance) => getEventDayKey(performance.eventDate)),
        ),
      ),
    [form.eventName, performances],
  );

  const roundOptions = useMemo(
    () =>
      performances
        .filter(
          (performance) =>
            performance.eventName === form.eventName && getEventDayKey(performance.eventDate) === form.eventDay,
        )
        .sort((left, right) => {
          const roundOrder = getRoundOrder(left) - getRoundOrder(right);
          if (roundOrder !== 0) return roundOrder;
          return left.eventDate.localeCompare(right.eventDate);
        }),
    [form.eventDay, form.eventName, performances],
  );

  const selectedPerformance = useMemo(
    () => performances.find((item) => item.id === form.performanceId),
    [form.performanceId, performances],
  );

  const buyerTicketCount = useMemo(() => {
    if (!currentUser || !selectedPerformance) return 0;
    return tickets.filter(
      (ticket) => ticket.buyerId === currentUser.id && ticket.performanceId === selectedPerformance.id,
    ).length;
  }, [currentUser, selectedPerformance, tickets]);

  const remainingBuyerLimit = Math.max(0, MAX_TICKETS_PER_BUYER_PER_PERFORMANCE - buyerTicketCount);
  const remainingSeatCount = useMemo(() => {
    if (!selectedPerformance) return 0;
    const soldCount = tickets.filter((ticket) => ticket.performanceId === selectedPerformance.id).length;
    return Math.max(0, selectedPerformance.seatCount - soldCount);
  }, [selectedPerformance, tickets]);

  const maxPurchasable = Math.max(0, Math.min(3, remainingBuyerLimit, remainingSeatCount));
  const selectedQuantity = Math.min(Number(form.quantity) || 1, Math.max(maxPurchasable, 1));
  const previewSeatNumbers = useMemo(
    () => getNextAvailableSeatNumbers(selectedPerformance, tickets, maxPurchasable > 0 ? selectedQuantity : 0),
    [maxPurchasable, selectedPerformance, selectedQuantity, tickets],
  );
  const purchasedTickets = useMemo(() => {
    if (!currentUser) return [];
    return tickets
      .filter((ticket) => ticket.buyerId === currentUser.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [currentUser, tickets]);
  const hasReadyFaceProfile = useMemo(() => {
    if (!currentUser) return false;
    return faceProfiles.some(
      (profile) =>
        profile.userId === currentUser.id &&
        profile.status === "ready" &&
        Array.isArray(profile.snapshotBlobIds) &&
        profile.snapshotBlobIds.length > 0,
    );
  }, [currentUser, faceProfiles]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentUser || !selectedPerformance || maxPurchasable === 0) {
      return;
    }

    try {
      createTicketsForPurchase({
        id: selectedPerformance.id,
        buyerId: currentUser.id,
        eventName: selectedPerformance.eventName,
        eventDate: selectedPerformance.eventDate,
        seatCount: selectedPerformance.seatCount,
        quantity: selectedQuantity,
      });
      setErrorMessage("");
      refreshTickets();
      setForm({
        eventName: "",
        eventDay: "",
        performanceId: "",
        quantity: "1",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "티켓을 생성하지 못했습니다.");
    }
  };

  if (!currentUser) {
    return <EmptyState title="로그인 정보가 없습니다." description="다시 로그인한 뒤 티켓구매를 진행해 주세요." />;
  }

  if (performances.length === 0) {
    return (
      <EmptyState
        title="먼저 공연을 등록해 주세요"
        description="공연등록 탭에서 공연 정보를 등록하면 티켓 생성에서 선택할 수 있습니다."
      />
    );
  }

  if (!hasReadyFaceProfile) {
    return (
      <div className="list">
        <EmptyState
          title="얼굴등록이 먼저 필요합니다"
          description="회원가입 후 얼굴등록을 완료해야 티켓구매를 진행할 수 있습니다."
        />
        <Link href="/user/face-register">
          <Button type="button">얼굴등록 하러가기</Button>
        </Link>
        {purchasedTickets.length > 0 ? (
          <div className="list">
            {purchasedTickets.map((ticket) => (
              <article key={ticket.id} className="panel">
                <strong>{ticket.eventName}</strong>
                <p className="list-card__meta">티켓번호: {ticket.id}</p>
                <p className="helper-text">
                  {formatDate(ticket.eventDate)} / {ticket.seatNo}
                </p>
                <div style={{ background: "#ffffff", padding: 16, borderRadius: 16, width: "fit-content" }}>
                  <QRCode value={ticket.id} size={180} />
                </div>
                <p className="helper-text">QR에는 ticketId만 포함됩니다.</p>
                <p className="list-card__meta">생성일: {formatDateTime(ticket.createdAt)}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="list">
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="eventName">공연선택</label>
          <select
            id="eventName"
            value={form.eventName}
            onChange={(event) =>
              setForm({
                eventName: event.target.value,
                eventDay: "",
                performanceId: "",
                quantity: "1",
              })
            }
          >
            <option value="">공연을 선택하세요</option>
            {eventNames.map((eventName) => (
              <option key={eventName} value={eventName}>
                {eventName}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="eventDay">공연날짜 선택</label>
          <select
            id="eventDay"
            value={form.eventDay}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                eventDay: event.target.value,
                performanceId: "",
                quantity: "1",
              }))
            }
            disabled={!form.eventName}
          >
            <option value="">공연날짜를 선택하세요</option>
            {dateOptions.map((eventDay) => (
              <option key={eventDay} value={eventDay}>
                {eventDay}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="performanceId">공연회차 선택</label>
          <select
            id="performanceId"
            value={form.performanceId}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                performanceId: event.target.value,
                quantity: "1",
              }));
              setErrorMessage("");
            }}
            disabled={!form.eventDay}
          >
            <option value="">공연회차를 선택하세요</option>
            {roundOptions.map((performance) => (
              <option key={performance.id} value={performance.id}>
                {getRoundLabel(performance)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="quantity">구매 수량</label>
          <select
            id="quantity"
            value={form.quantity}
            onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
            disabled={maxPurchasable === 0}
          >
            {maxPurchasable === 0 ? <option value="0">구매 불가</option> : null}
            {Array.from({ length: maxPurchasable }, (_, index) => String(index + 1)).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {selectedPerformance ? (
          <div className="panel panel--compact">
            <div className="list-card__meta">총 좌석: {selectedPerformance.seatCount}</div>
            <div className="list-card__meta">남은 좌석: {remainingSeatCount}</div>
            <div className="list-card__meta">내 구매 수: {buyerTicketCount} / 3</div>
            <div className="list-card__meta">
              자동 배정 좌석: {previewSeatNumbers.length > 0 ? previewSeatNumbers.join(", ") : "없음"}
            </div>
          </div>
        ) : null}

        {errorMessage ? <p className="helper-text">{errorMessage}</p> : null}

        <Button type="submit" disabled={!selectedPerformance || maxPurchasable === 0}>
          티켓구매
        </Button>
      </form>

      {purchasedTickets.length > 0 ? (
        <div className="list">
          {purchasedTickets.map((ticket) => (
            <article key={ticket.id} className="panel">
              <strong>{ticket.eventName}</strong>
              <p className="list-card__meta">티켓번호: {ticket.id}</p>
              <p className="helper-text">
                {formatDate(ticket.eventDate)} / {ticket.seatNo}
              </p>
              <div style={{ background: "#ffffff", padding: 16, borderRadius: 16, width: "fit-content" }}>
                <QRCode value={ticket.id} size={180} />
              </div>
              <p className="helper-text">QR에는 ticketId만 포함됩니다.</p>
              <p className="list-card__meta">생성일: {formatDateTime(ticket.createdAt)}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
