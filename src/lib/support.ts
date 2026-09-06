import { query, queryOne, transaction } from "./db";
import { supportReady } from "./schema";

/**
 * Sanatçı ↔ Label iletişim merkezi (M4NM Pulse § 9).
 *
 * Her talep bir KONUŞMA açar; iki taraf da aynı konuşma üzerinden yazışır.
 * Yetki kuralı tek cümle: bir konuşmaya yalnızca sahibi ve yöneticiler
 * erişebilir — ve sahiplik her zaman OTURUMDAN gelen kullanıcı kimliğiyle
 * karşılaştırılır, istekten gelen bir alanla değil.
 */

export type ThreadStatus = "open" | "answered" | "closed";
export type SenderRole = "user" | "admin";

export interface SupportMessage {
  id: string;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  createdAt: string;
  /** Bu mesajı okuyan kişi mi yazdı? (balon yönü için) */
  mine?: boolean;
}

export interface SupportThread {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: ThreadStatus;
  lastMessageAt: string;
  createdAt: string;
  messageCount: number;
  /** Son mesajın kısa özeti — liste görünümü için. */
  preview: string;
  /** Bu tarafa göre okunmamış mı? */
  unread: boolean;
}

export interface ThreadDetail extends SupportThread {
  messages: SupportMessage[];
}

const clip = (s: string, n = 140) =>
  s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

/* ------------------------------------------------------------- listeleme */

interface ListInput {
  /** Yalnızca bu kullanıcının konuşmaları (sanatçı görünümü). */
  ownerId?: string;
  /** Yönetici görünümünde kullanıcıya göre süzme. */
  userId?: string;
  status?: ThreadStatus | "all";
  /** Konu veya kullanıcı adında arama. */
  q?: string;
  /** Okunmamış hesabı hangi tarafa göre yapılacak. */
  side: "user" | "admin";
  limit?: number;
}

export async function listThreads(input: ListInput): Promise<SupportThread[]> {
  // 0010 çalışmadıysa kutu boş görünür, ekran hata vermez.
  if (!(await supportReady())) return [];

  const where: string[] = [];
  const params: unknown[] = [];
  const push = (v: unknown) => { params.push(v); return `$${params.length}`; };

  if (input.ownerId) where.push(`t.user_id = ${push(input.ownerId)}`);
  if (input.userId) where.push(`t.user_id = ${push(input.userId)}`);
  if (input.status && input.status !== "all") where.push(`t.status = ${push(input.status)}`);
  if (input.q) {
    const p = push(`%${input.q}%`);
    where.push(`(t.subject ilike ${p} or u.first_name || ' ' || u.last_name ilike ${p} or u.email ilike ${p})`);
  }

  const readCol = input.side === "admin" ? "t.admin_read_at" : "t.user_read_at";
  const limit = push(input.limit ?? 200);

  const rows = await query<{
    id: string; user_id: string; user_name: string; user_email: string;
    subject: string; status: ThreadStatus; last_message_at: string;
    created_at: string; message_count: number; preview: string | null; unread: boolean;
  }>(
    `select t.id, t.user_id,
            coalesce(nullif(trim(u.first_name || ' ' || u.last_name), ''), u.email) user_name,
            u.email user_email,
            t.subject, t.status, t.last_message_at, t.created_at,
            (select count(*) from support_messages m where m.thread_id = t.id)::int message_count,
            (select m.body from support_messages m
              where m.thread_id = t.id order by m.created_at desc limit 1) preview,
            (${readCol} is null or ${readCol} < t.last_message_at) unread
     from support_threads t
     join users u on u.id = t.user_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by t.last_message_at desc
     limit ${limit}`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    subject: r.subject,
    status: r.status,
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
    messageCount: r.message_count,
    preview: clip(r.preview ?? ""),
    unread: r.unread,
  }));
}

/** Yönetim kutusundaki okunmamış konuşma sayısı — kenar çubuğu rozeti. */
export async function unreadThreadCount(side: "user" | "admin", ownerId?: string): Promise<number> {
  const readCol = side === "admin" ? "admin_read_at" : "user_read_at";
  try {
    const r = await queryOne<{ c: number }>(
      `select count(*)::int c from support_threads t
       where (${readCol} is null or ${readCol} < t.last_message_at)
         ${ownerId ? "and t.user_id = $1" : ""}`,
      ownerId ? [ownerId] : []
    );
    return r?.c ?? 0;
  } catch {
    // 0010 migration'ı henüz çalışmadıysa rozet sıfır görünür, ekran bozulmaz.
    return 0;
  }
}

/**
 * Konuşmayı mesajlarıyla getirir ve OKUYAN TARAF için okundu işaretler.
 *
 * `viewerId` sahiplik denetimi içindir: admin değilse yalnızca kendi
 * konuşmasını açabilir. Erişim yoksa null döner — çağıran 403 verir.
 */
export async function getThread(
  threadId: string,
  viewer: { userId: string; isAdmin: boolean }
): Promise<ThreadDetail | null> {
  if (!(await supportReady())) return null;

  const head = await queryOne<{
    id: string; user_id: string; user_name: string; user_email: string;
    subject: string; status: ThreadStatus; last_message_at: string; created_at: string;
  }>(
    `select t.id, t.user_id,
            coalesce(nullif(trim(u.first_name || ' ' || u.last_name), ''), u.email) user_name,
            u.email user_email,
            t.subject, t.status, t.last_message_at, t.created_at
     from support_threads t join users u on u.id = t.user_id
     where t.id = $1`,
    [threadId]
  );
  if (!head) return null;
  if (!viewer.isAdmin && head.user_id !== viewer.userId) return null;

  const msgs = await query<{
    id: string; sender_role: SenderRole; sender_name: string;
    body: string; created_at: string; sender_id: string | null;
  }>(
    `select id, sender_role, sender_name, body, created_at, sender_id
     from support_messages where thread_id = $1 order by created_at`,
    [threadId]
  );

  // Okundu işareti — okuyan taraf için.
  const col = viewer.isAdmin ? "admin_read_at" : "user_read_at";
  await query(`update support_threads set ${col} = now() where id = $1`, [threadId]);

  return {
    id: head.id,
    userId: head.user_id,
    userName: head.user_name,
    userEmail: head.user_email,
    subject: head.subject,
    status: head.status,
    lastMessageAt: head.last_message_at,
    createdAt: head.created_at,
    messageCount: msgs.length,
    preview: clip(msgs[msgs.length - 1]?.body ?? ""),
    unread: false,
    messages: msgs.map((m) => ({
      id: m.id,
      senderRole: m.sender_role,
      senderName: m.sender_name,
      body: m.body,
      createdAt: m.created_at,
      mine: m.sender_id === viewer.userId,
    })),
  };
}

/* ---------------------------------------------------------------- yazma */

export interface NewThreadInput {
  userId: string;
  userName: string;
  subject: string;
  body: string;
}

export async function createThread(input: NewThreadInput): Promise<{ id: string; error?: string }> {
  if (!(await supportReady())) {
    return { id: "", error: "İletişim merkezi altyapısı henüz kurulmadı (0010 migration'ı çalıştırılmalı)." };
  }
  return transaction(async (c) => {
    const t = await c.query<{ id: string }>(
      `insert into support_threads (user_id, subject, status, user_read_at, last_message_at)
       values ($1, $2, 'open', now(), now())
       returning id`,
      [input.userId, input.subject]
    );
    const id = t.rows[0].id;
    await c.query(
      `insert into support_messages (thread_id, sender_id, sender_role, sender_name, body)
       values ($1, $2, 'user', $3, $4)`,
      [id, input.userId, input.userName, input.body]
    );
    return { id };
  });
}

export interface ReplyInput {
  threadId: string;
  senderId: string;
  senderName: string;
  role: SenderRole;
  body: string;
}

export async function addReply(input: ReplyInput): Promise<{ ok: boolean; error?: string }> {
  if (!(await supportReady())) {
    return { ok: false, error: "İletişim merkezi altyapısı henüz kurulmadı." };
  }
  return transaction(async (c) => {
    const t = await c.query<{ user_id: string; status: ThreadStatus }>(
      `select user_id, status from support_threads where id = $1 for update`,
      [input.threadId]
    );
    if (t.rows.length === 0) return { ok: false, error: "Konuşma bulunamadı." };

    await c.query(
      `insert into support_messages (thread_id, sender_id, sender_role, sender_name, body)
       values ($1,$2,$3,$4,$5)`,
      [input.threadId, input.senderId, input.role, input.senderName, input.body]
    );

    // Cevap veren taraf için okundu; karşı taraf için okunmamış olur.
    // Kapalı bir konuşmaya yazmak onu yeniden açar — kullanıcı yeni bir
    // talep açmak zorunda kalmasın.
    const yeniDurum: ThreadStatus = input.role === "admin" ? "answered" : "open";
    await c.query(
      `update support_threads
         set last_message_at = now(),
             status = $2,
             ${input.role === "admin" ? "admin_read_at" : "user_read_at"} = now()
       where id = $1`,
      [input.threadId, yeniDurum]
    );
    return { ok: true };
  });
}

export async function setThreadStatus(
  threadId: string,
  status: ThreadStatus
): Promise<void> {
  await query(`update support_threads set status = $2 where id = $1`, [threadId, status]);
}

/** Konuşmanın sahibi kim? Yetki denetimi için ucuz sorgu. */
export async function threadOwner(threadId: string): Promise<{ userId: string; subject: string } | null> {
  if (!(await supportReady())) return null;
  const r = await queryOne<{ user_id: string; subject: string }>(
    `select user_id, subject from support_threads where id = $1`,
    [threadId]
  );
  return r ? { userId: r.user_id, subject: r.subject } : null;
}
