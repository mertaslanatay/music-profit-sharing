import { query, queryOne } from "./db";

/**
 * Denetim kaydı ekranı için sorgular.
 *
 * audit_log zaten her mali veri görüntülemesinde ve her para/yetki
 * işleminde yazılıyor (bkz. lib/access.ts → audit, lib/guard.ts → logAction).
 * Burada sadece admin panelinde okunabilir/filtrelenebilir hale getiriyoruz.
 */

export interface AuditRow {
  id: number;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  userId?: string;
  /** e-posta, ad veya kaynak alanında serbest arama */
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function mapRow(r: {
  id: number; user_id: string | null; email: string | null;
  first_name: string | null; last_name: string | null;
  action: string; resource: string | null; ip: string | null;
  user_agent: string | null; meta: Record<string, unknown>; created_at: string;
}): AuditRow {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.email,
    userName: r.first_name || r.last_name ? [r.first_name, r.last_name].filter(Boolean).join(" ") : null,
    action: r.action,
    resource: r.resource,
    ip: r.ip,
    userAgent: r.user_agent,
    meta: r.meta ?? {},
    createdAt: r.created_at,
  };
}

export async function listAuditLog(f: AuditFilters): Promise<{ rows: AuditRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 0;

  if (f.action) { params.push(f.action); conditions.push(`a.action = $${++i}`); }
  if (f.userId) { params.push(f.userId); conditions.push(`a.user_id = $${++i}`); }
  if (f.from) { params.push(f.from); conditions.push(`a.created_at >= $${++i}::timestamptz`); }
  if (f.to) { params.push(f.to); conditions.push(`a.created_at <= $${++i}::timestamptz`); }
  if (f.q) {
    params.push(`%${f.q}%`);
    conditions.push(`(u.email ilike $${++i} or a.resource ilike $${i} or u.first_name ilike $${i} or u.last_name ilike $${i})`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const [rows, countRow] = await Promise.all([
    query<{
      id: number; user_id: string | null; email: string | null;
      first_name: string | null; last_name: string | null;
      action: string; resource: string | null; ip: string | null;
      user_agent: string | null; meta: Record<string, unknown>; created_at: string;
    }>(
      `select a.id, a.user_id, u.email, u.first_name, u.last_name,
              a.action, a.resource, a.ip::text, a.user_agent, a.meta, a.created_at
       from audit_log a
       left join users u on u.id = a.user_id
       ${where}
       order by a.created_at desc
       limit ${pageSize} offset ${offset}`,
      params
    ),
    queryOne<{ count: string }>(
      `select count(*)::text as count from audit_log a left join users u on u.id = a.user_id ${where}`,
      params
    ),
  ]);

  return { rows: rows.map(mapRow), total: Number(countRow?.count ?? 0) };
}

/** Filtre menüsü için görülen tüm eylem adları. */
export async function listAuditActions(): Promise<string[]> {
  const rows = await query<{ action: string }>(
    `select distinct action from audit_log order by action`
  );
  return rows.map((r) => r.action);
}

export interface SuspiciousActivity {
  userId: string;
  email: string;
  name: string;
  count: number;
  lastAt: string;
}

export interface SuspiciousLogin {
  resource: string;
  count: number;
  lastAt: string;
}

/**
 * Basit şüpheli hareket tespiti:
 *  - kısa sürede çok fazla görüntüleme/indirme yapan kullanıcılar
 *  - kısa sürede çok fazla başarısız giriş denemesi olan e-postalar
 */
export async function findSuspiciousActivity(): Promise<{
  heavyActivity: SuspiciousActivity[];
  failedLogins: SuspiciousLogin[];
}> {
  const [heavy, failed] = await Promise.all([
    query<{ user_id: string; email: string; first_name: string | null;
      last_name: string | null; c: string; last_at: string }>(
      `select a.user_id, u.email, u.first_name, u.last_name,
              count(*)::text c, max(a.created_at) last_at
       from audit_log a
       join users u on u.id = a.user_id
       where a.action in ('view_dashboard','view_ledger','view_account','export_xlsx')
         and a.created_at > now() - interval '1 hour'
       group by a.user_id, u.email, u.first_name, u.last_name
       having count(*) >= 15
       order by count(*) desc
       limit 20`
    ),
    query<{ resource: string; c: string; last_at: string }>(
      `select resource, count(*)::text c, max(created_at) last_at
       from audit_log
       where action = 'login_failed' and created_at > now() - interval '30 minutes'
         and resource is not null
       group by resource
       having count(*) >= 5
       order by count(*) desc
       limit 20`
    ),
  ]);

  return {
    heavyActivity: heavy.map((r) => ({
      userId: r.user_id,
      email: r.email,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
      count: Number(r.c),
      lastAt: r.last_at,
    })),
    failedLogins: failed.map((r) => ({
      resource: r.resource,
      count: Number(r.c),
      lastAt: r.last_at,
    })),
  };
}
