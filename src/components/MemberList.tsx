"use client";

import { localStore } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";

export function MemberList() {
  const { data: users } = useLocalData(() => localStore.getUsers(), [], []);

  if (users.length === 0) {
    return <EmptyState title="등록된 회원이 없습니다." description="이용자 회원가입 후 여기에서 바로 확인할 수 있습니다." />;
  }

  return (
    <div className="list">
      {users.map((user) => (
        <article key={user.id} className="list-card">
          <strong>{user.name}</strong>
          <div className="list-card__meta">{user.email}</div>
          <div className="list-card__meta">{user.phone}</div>
          <div className="list-card__meta">ID: {user.id}</div>
          <div className="list-card__meta">가입일: {formatDateTime(user.createdAt)}</div>
        </article>
      ))}
    </div>
  );
}
