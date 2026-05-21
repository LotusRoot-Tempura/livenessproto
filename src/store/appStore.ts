import { localStore } from "@/lib/storage";

export function getDashboardStats() {
  const users = localStore.getUsers();
  const tickets = localStore.getTickets();
  const logs = localStore.getEntryLogs();
  return {
    users: users.length,
    tickets: tickets.length,
    successLogs: logs.filter((item) => item.result === "allowed").length,
    reviewLogs: logs.filter((item) => item.result === "manual_review").length,
  };
}
