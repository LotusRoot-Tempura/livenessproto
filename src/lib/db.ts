import { openDB } from "idb";

const DB_NAME = "grab-ticket-face-db";
const DB_VERSION = 1;
const VIDEO_STORE = "faceVideos";
const IMAGE_STORE = "faceImages";

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE);
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
    },
  });
}

export const mediaDb = {
  async saveVideo(id: string, blob: Blob) {
    const db = await getDb();
    await db.put(VIDEO_STORE, blob, id);
  },
  async getVideo(id: string) {
    const db = await getDb();
    return (await db.get(VIDEO_STORE, id)) as Blob | undefined;
  },
  async saveImage(id: string, blob: Blob) {
    const db = await getDb();
    await db.put(IMAGE_STORE, blob, id);
  },
  async getImage(id: string) {
    const db = await getDb();
    return (await db.get(IMAGE_STORE, id)) as Blob | undefined;
  },
};
