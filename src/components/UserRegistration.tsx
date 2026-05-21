"use client";

import { FormEvent, useState } from "react";
import { createUser } from "@/lib/mock";
import { localStore } from "@/lib/storage";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useLocalData } from "@/hooks/useLocalData";

export function UserRegistration() {
  const { data: users, refresh } = useLocalData(() => localStore.getUsers(), [], []);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.phone) return;
    createUser(form);
    setForm({ name: "", email: "", phone: "" });
    refresh();
  };

  return (
    <div className="list">
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="name">이름</label>
          <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="phone">전화번호</label>
          <input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <Button type="submit">이용자 등록</Button>
      </form>

      {users.length === 0 ? (
        <EmptyState title="등록된 이용자가 없습니다." description="먼저 기본 정보를 등록해 주세요." />
      ) : (
        users.map((user) => (
          <article key={user.id} className="list-card">
            <strong>{user.name}</strong>
            <div className="list-card__meta">{user.email}</div>
            <div className="list-card__meta">{user.phone}</div>
            <div className="list-card__meta">ID: {user.id}</div>
            <div className="list-card__meta">생성일: {formatDateTime(user.createdAt)}</div>
          </article>
        ))
      )}
    </div>
  );
}
