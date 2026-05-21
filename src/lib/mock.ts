import { v4 as uuid } from "uuid";
import { localStore } from "@/lib/storage";
import type {
  EntryLog,
  FaceProfile,
  StoredFaceCapture,
  Ticket,
  TransferHistory,
  User,
  ZkIdentity,
} from "@/types/models";

export function createUser(payload: Pick<User, "name" | "email" | "phone">): User {
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

export function deleteFaceProfile(faceProfileId: string) {
  const next = localStore.getFaceProfiles().filter((item) => item.id !== faceProfileId);
  localStore.saveFaceProfiles(next);
}

export function createTicket(payload: Pick<Ticket, "eventName" | "eventDate" | "seatNo" | "buyerId">): Ticket {
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
