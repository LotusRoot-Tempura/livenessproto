import { STORAGE_KEYS } from "@/lib/constants";
import type {
  EntryLog,
  FaceProfile,
  Performance,
  StoredFaceCapture,
  Ticket,
  TransferHistory,
  User,
  ZkIdentity,
} from "@/types/models";

export const STORAGE_STATE_EVENT = "gtf-storage-state-changed";

type LegacyFaceProfile = FaceProfile & {
  videoBlobId?: string;
  snapshotBlobIds?: string[];
};

type StorageShape = {
  [STORAGE_KEYS.users]: User[];
  [STORAGE_KEYS.faceProfiles]: FaceProfile[];
  [STORAGE_KEYS.performances]: Performance[];
  [STORAGE_KEYS.tickets]: Ticket[];
  [STORAGE_KEYS.transferHistory]: TransferHistory[];
  [STORAGE_KEYS.zkIdentities]: ZkIdentity[];
  [STORAGE_KEYS.entryLogs]: EntryLog[];
  [STORAGE_KEYS.faceCaptures]: StoredFaceCapture[];
};

function read<T>(key: keyof StorageShape): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function write<T>(key: keyof StorageShape, data: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(STORAGE_STATE_EVENT, { detail: { key } }));
}

export const localStore = {
  getUsers: () => read<User>(STORAGE_KEYS.users),
  saveUsers: (items: User[]) => write(STORAGE_KEYS.users, items),
  getFaceProfiles: () =>
    read<LegacyFaceProfile>(STORAGE_KEYS.faceProfiles).map((item) => ({
      ...item,
      snapshotBlobIds: Array.isArray(item.snapshotBlobIds) ? item.snapshotBlobIds : [],
    })),
  saveFaceProfiles: (items: FaceProfile[]) => write(STORAGE_KEYS.faceProfiles, items),
  getPerformances: () => read<Performance>(STORAGE_KEYS.performances),
  savePerformances: (items: Performance[]) => write(STORAGE_KEYS.performances, items),
  getTickets: () => read<Ticket>(STORAGE_KEYS.tickets),
  saveTickets: (items: Ticket[]) => write(STORAGE_KEYS.tickets, items),
  getTransfers: () => read<TransferHistory>(STORAGE_KEYS.transferHistory),
  saveTransfers: (items: TransferHistory[]) => write(STORAGE_KEYS.transferHistory, items),
  getZkIdentities: () => read<ZkIdentity>(STORAGE_KEYS.zkIdentities),
  saveZkIdentities: (items: ZkIdentity[]) => write(STORAGE_KEYS.zkIdentities, items),
  getEntryLogs: () => read<EntryLog>(STORAGE_KEYS.entryLogs),
  saveEntryLogs: (items: EntryLog[]) => write(STORAGE_KEYS.entryLogs, items),
  getFaceCaptures: () => read<StoredFaceCapture>(STORAGE_KEYS.faceCaptures),
  saveFaceCaptures: (items: StoredFaceCapture[]) => write(STORAGE_KEYS.faceCaptures, items),
};
