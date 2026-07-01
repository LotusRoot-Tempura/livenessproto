export type TicketStatus = "active" | "used" | "cancelled";
export type FaceProfileStatus = "ready" | "pending" | "rejected";
export type EntryResult = "allowed" | "manual_review" | "denied";
export type PerformanceStatus = "운영" | "보류" | "종료";

export type UserRole = "user" | "venue-tablet" | "tablet-admin";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role?: UserRole;
  password?: string;
  createdAt: string;
}

export interface FaceProfile {
  id: string;
  userId: string;
  snapshotBlobIds: string[];
  status: FaceProfileStatus;
  createdAt: string;
}

export interface Performance {
  id: string;
  eventName: string;
  eventDate: string;
  roundLabel?: string;
  shareCode?: string;
  status?: PerformanceStatus;
  seatCount: number;
  artistName: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  performanceId?: string;
  eventName: string;
  eventDate: string;
  seatNo: string;
  buyerId: string;
  holderUserId: string;
  qrHash?: string;
  status: TicketStatus;
  createdAt: string;
}

export interface TransferHistory {
  id: string;
  ticketId: string;
  fromHolderUserId: string;
  toHolderUserId: string;
  changedAt: string;
}

export interface ZkIdentity {
  id: string;
  userId: string;
  commitment: string;
  mockSecretStoredLocal: string;
  createdAt: string;
}

export interface EntryLog {
  id: string;
  ticketId: string;
  holderUserId: string;
  qrValid: boolean;
  zkValid: boolean;
  faceSimilarity: number;
  result: EntryResult;
  createdAt: string;
}

export interface StoredFaceCapture {
  id: string;
  ticketId: string;
  holderUserId: string;
  blobId: string;
  createdAt: string;
}

export interface FaceQualityState {
  detected: boolean;
  singleFace: boolean;
  centered: boolean;
  properSize: boolean;
  lightingGood: boolean;
  frontFacing: boolean;
  leftAngle: boolean;
  rightAngle: boolean;
  blinkDetected: boolean;
  occlusionClear: boolean;
  score: number;
  readyToRecord: boolean;
  message: string;
}
