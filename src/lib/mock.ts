import { v4 as uuid } from "uuid";
import { localStore } from "@/lib/storage";
import type {
  EntryLog,
  FaceProfile,
  Performance,
  PerformanceStatus,
  StoredFaceCapture,
  Ticket,
  TransferHistory,
  User,
  ZkIdentity,
} from "@/types/models";

export const MAX_TICKETS_PER_BUYER_PER_PERFORMANCE = 3;

function createPerformanceShareCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const performances = localStore.getPerformances();

  while (true) {
    let code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    if (!performances.some((performance) => performance.shareCode === code)) {
      return code;
    }
  }
}

export function createUser(payload: Pick<User, "name" | "email" | "phone"> & Partial<Pick<User, "password">>): User {
  const next: User = { id: uuid(), createdAt: new Date().toISOString(), ...payload };
  localStore.saveUsers([next, ...localStore.getUsers()]);
  createMockZkIdentity(next.id);
  return next;
}

export function createMockZkIdentity(userId: string): ZkIdentity {
  const item: ZkIdentity = {
    id: uuid(),
    userId,
    commitment: `commitment-${crypto.randomUUID().slice(0, 8)}`,
    mockSecretStoredLocal: `local-secret-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  localStore.saveZkIdentities([item, ...localStore.getZkIdentities()]);
  return item;
}

export function createFaceProfile(userId: string, snapshotBlobIds: string[]): FaceProfile {
  const item: FaceProfile = {
    id: uuid(),
    userId,
    snapshotBlobIds,
    status: "ready",
    createdAt: new Date().toISOString(),
  };
  localStore.saveFaceProfiles([item, ...localStore.getFaceProfiles()]);
  return item;
}

export function createPerformance(
  payload: Pick<Performance, "eventName" | "eventDate" | "seatCount" | "artistName"> &
    Partial<Pick<Performance, "roundLabel" | "shareCode" | "status">>,
): Performance {
  const item: Performance = {
    id: uuid(),
    shareCode: payload.shareCode ?? createPerformanceShareCode(),
    status: payload.status ?? "운영",
    createdAt: new Date().toISOString(),
    ...payload,
  };
  localStore.savePerformances([item, ...localStore.getPerformances()]);
  return item;
}

export function updatePerformance(
  performanceId: string,
  payload: Partial<Pick<Performance, "eventName" | "eventDate" | "roundLabel" | "seatCount" | "artistName" | "status">>,
) {
  const performances = localStore.getPerformances();
  const updated = performances.map((performance) =>
    performance.id === performanceId ? { ...performance, ...payload } : performance,
  );
  localStore.savePerformances(updated);
  return updated.find((performance) => performance.id === performanceId) ?? null;
}

export function updatePerformanceStatus(performanceId: string, status: PerformanceStatus) {
  return updatePerformance(performanceId, { status });
}

export function deletePerformance(performanceId: string) {
  const next = localStore.getPerformances().filter((performance) => performance.id !== performanceId);
  localStore.savePerformances(next);
}

export function duplicatePerformance(performanceId: string) {
  const performance = localStore.getPerformances().find((item) => item.id === performanceId);
  if (!performance) return null;

  return createPerformance({
    eventName: performance.eventName,
    eventDate: performance.eventDate,
    roundLabel: performance.roundLabel,
    seatCount: performance.seatCount,
    artistName: performance.artistName,
    status: performance.status ?? "운영",
  });
}

export function deleteTicket(ticketId: string) {
  const nextTickets = localStore.getTickets().filter((ticket) => ticket.id !== ticketId);
  const nextTransfers = localStore.getTransfers().filter((transfer) => transfer.ticketId !== ticketId);
  const nextEntryLogs = localStore.getEntryLogs().filter((entryLog) => entryLog.ticketId !== ticketId);
  const nextFaceCaptures = localStore.getFaceCaptures().filter((capture) => capture.ticketId !== ticketId);

  localStore.saveTickets(nextTickets);
  localStore.saveTransfers(nextTransfers);
  localStore.saveEntryLogs(nextEntryLogs);
  localStore.saveFaceCaptures(nextFaceCaptures);
}

export function deleteFaceProfile(faceProfileId: string) {
  const next = localStore.getFaceProfiles().filter((item) => item.id !== faceProfileId);
  localStore.saveFaceProfiles(next);
}

export function cancelTicket(ticketId: string) {
  const tickets = localStore.getTickets();
  const updated = tickets.map((ticket) =>
    ticket.id === ticketId ? { ...ticket, status: "cancelled" as const } : ticket,
  );
  localStore.saveTickets(updated);
  return updated.find((ticket) => ticket.id === ticketId) ?? null;
}

export function createTicket(
  payload: Pick<Ticket, "eventName" | "eventDate" | "seatNo" | "buyerId"> & Partial<Pick<Ticket, "performanceId">>,
): Ticket {
  const item: Ticket = {
    id: uuid(),
    holderUserId: payload.buyerId,
    status: "active",
    createdAt: new Date().toISOString(),
    ...payload,
  };
  localStore.saveTickets([item, ...localStore.getTickets()]);
  return item;
}

function extractSeatSequence(seatNo: string) {
  const match = seatNo.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function createTicketsForPurchase(
  payload: Pick<Ticket, "buyerId" | "eventName" | "eventDate"> &
    Pick<Performance, "id" | "seatCount"> & {
      quantity: number;
    },
): Ticket[] {
  const tickets = localStore.getTickets();
  const performanceTickets = tickets.filter((ticket) => ticket.performanceId === payload.id && ticket.status !== "cancelled");
  const buyerTickets = performanceTickets.filter((ticket) => ticket.buyerId === payload.buyerId);

  if (buyerTickets.length + payload.quantity > MAX_TICKETS_PER_BUYER_PER_PERFORMANCE) {
    throw new Error("한 계정당 같은 공연은 최대 3장까지 구매할 수 있습니다.");
  }

  const takenSeats = new Set(
    performanceTickets
      .map((ticket) => extractSeatSequence(ticket.seatNo))
      .filter((seatNo): seatNo is number => seatNo !== null),
  );

  const nextSeatNumbers: number[] = [];
  for (let seat = 1; seat <= payload.seatCount; seat += 1) {
    if (takenSeats.has(seat)) continue;
    nextSeatNumbers.push(seat);
    if (nextSeatNumbers.length === payload.quantity) break;
  }

  if (nextSeatNumbers.length < payload.quantity) {
    throw new Error("선택한 공연의 남은 좌석이 부족합니다.");
  }

  const createdAt = new Date().toISOString();
  const createdTickets = nextSeatNumbers.map((seatNumber) => ({
    id: uuid(),
    performanceId: payload.id,
    eventName: payload.eventName,
    eventDate: payload.eventDate,
    seatNo: String(seatNumber),
    buyerId: payload.buyerId,
    holderUserId: payload.buyerId,
    status: "active" as const,
    createdAt,
  }));

  localStore.saveTickets([...createdTickets, ...tickets]);
  return createdTickets;
}

export function transferTicketHolder(ticketId: string, nextHolderUserId: string): Ticket | null {
  const tickets = localStore.getTickets();
  const current = tickets.find((item) => item.id === ticketId);
  if (!current) return null;
  const history: TransferHistory = {
    id: uuid(),
    ticketId,
    fromHolderUserId: current.holderUserId,
    toHolderUserId: nextHolderUserId,
    changedAt: new Date().toISOString(),
  };
  const updated = tickets.map((item) =>
    item.id === ticketId ? { ...item, holderUserId: nextHolderUserId } : item,
  );
  localStore.saveTickets(updated);
  localStore.saveTransfers([history, ...localStore.getTransfers()]);
  return updated.find((item) => item.id === ticketId) ?? null;
}

export function createFaceCapture(ticketId: string, holderUserId: string, blobId: string): StoredFaceCapture {
  const item: StoredFaceCapture = {
    id: uuid(),
    ticketId,
    holderUserId,
    blobId,
    createdAt: new Date().toISOString(),
  };
  localStore.saveFaceCaptures([item, ...localStore.getFaceCaptures()]);
  return item;
}

export function createEntryLog(payload: Omit<EntryLog, "id" | "createdAt">): EntryLog {
  const item: EntryLog = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    ...payload,
  };
  localStore.saveEntryLogs([item, ...localStore.getEntryLogs()]);
  return item;
}
