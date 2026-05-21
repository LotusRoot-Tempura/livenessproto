import { EntryResult } from "@/types/models";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function getEntryResult(similarity: number): EntryResult {
  if (similarity >= 85) return "allowed";
  if (similarity >= 70) return "manual_review";
  return "denied";
}

export function getResultTone(result: EntryResult): "success" | "warning" | "danger" {
  if (result === "allowed") return "success";
  if (result === "manual_review") return "warning";
  return "danger";
}

export function isTransferAllowed(eventDate: string) {
  const target = new Date(eventDate).getTime();
  const diffHours = (target - Date.now()) / (1000 * 60 * 60);
  return diffHours >= 24;
}

export async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
