"use client";

import { localStore } from "@/lib/storage";
import { formatDateTime, getResultTone } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";

export function EntryLogList() {
  const { data: logs } = useLocalData(() => localStore.getEntryLogs(), [], []);

  if (logs.length === 0) {
    return <EmptyState title="입장 로그가 없습니다." description="QR 인증과 얼굴 인증을 진행하면 기록이 쌓입니다." />;
  }

  return (
    <div className="list">
      {logs.map((log) => (
        <article key={log.id} className="list-card">
          <strong>티켓 ID: {log.ticketId}</strong>
          <div className="badge-row">
            <Badge tone={log.qrValid ? "success" : "danger"}>QR {log.qrValid ? "정상" : "실패"}</Badge>
            <Badge tone={log.zkValid ? "success" : "danger"}>ZK {log.zkValid ? "정상" : "실패"}</Badge>
            <Badge tone={getResultTone(log.result)}>{log.result}</Badge>
          </div>
          <div className="list-card__meta">입장자 ID: {log.holderUserId}</div>
          <div className="list-card__meta">얼굴 유사도 mock: {log.faceSimilarity}%</div>
          <div className="list-card__meta">처리 시각: {formatDateTime(log.createdAt)}</div>
        </article>
      ))}
    </div>
  );
}
