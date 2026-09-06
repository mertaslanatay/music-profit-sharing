import { query, queryOne, transaction } from "./db";
import { creditsSource, transfersReady } from "./schema";

/**
 * Şarkı bazlı dönemsel gelir hakkı devri (M4NM Pulse § 2, § 3).
 *
 * Devir, şarkının kalıcı bölüşümünü DEĞİŞTİRMEZ. Yalnızca seçilen ödeme
 * partisi + dönem için, devreden sanatçının o şarkıdaki KENDİ payının bir
 * oranını devralan sanatçıya taşır. Uygulama okuma anında, v_credits_effective
 * görünümünde yapılır (bkz. 0009) — bu yüzden ayrı bir "yeniden hesaplama"
 * adımı yoktur, devir kaydedildiği an panel, bakiye ve portal aynı rakamı
 * gösterir; geri alındığında da tam eski hâline döner.
 */

export interface SongArtistRow {
  artistId: string;
  artistName: string;
  /** Şarkının kalıcı bölüşümündeki payı (0..1) — devirlerden etkilenmez. */
  baseShare: number;
  /** Bu dönemde devirlerden SONRA geçerli pay (0..1). */
  effectiveShare: number;
  /** Bu dönemdeki brüt hakedişi (devirler uygulanmış). */
  gross: number;
  /** Devirler uygulanmadan önceki brüt — karşılaştırma için. */
  baseGross: number;
  /**
   * Tutar bu kullanıcıdan gizlendi mi?
   *
   * Bir sanatçı, birlikte olduğu şarkıdaki diğer sanatçıların YÜZDESİNİ
   * görmek zorundadır (devri kime, ne oranda yapacağına karar vermek için),
   * ama PARASINI görmek zorunda değildir. `can_see_other_artists` kapalıysa
   * başkalarının tutarı sıfırlanır ve bu bayrak true olur — arayüz "—"
   * gösterir. Admin ve yetkilendirilmiş kullanıcılarda her zaman false.
   */
  amountHidden?: boolean;
}

export interface TransferRow {
  id: string;
  reportId: string;
  periodId: string;
  periodLabel: string;
  songId: string;
  songTitle: string;
  fromArtistId: string;
  fromArtistName: string;
  toArtistId: string;
  toArtistName: string;
  ratio: number;
  /** Devrin taşıdığı tutar (devredenin o dönemdeki payından). */
  amount: number;
  status: "active" | "reverted";
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  revertedAt: string | null;
}

export interface SongPeriodDetail {
  songId: string;
  title: string;
  album: string;
  isrc: string;
  artistString: string;
  reportId: string;
  reportTitle: string;
  reportStatus: "draft" | "published" | "locked";
  periodId: string;
  periodLabel: string;
  /** Şarkının bu dönemdeki toplam brütü (devirlerden bağımsız, sabit). */
  totalGross: number;
  artists: SongArtistRow[];
  transfers: TransferRow[];
}

/* --------------------------------------------------------------- okuma */

/**
 * Bir şarkının belirli bir rapor+dönemdeki dağılımı ve devir geçmişi.
 *
 * Hem "normal dağılım" (credits) hem "bu dönemdeki dağılım" (etkin krediler)
 * birlikte döner — drawer ikisini yan yana gösterir.
 */
export async function songPeriodDetail(
  songId: string,
  reportId: string,
  periodId: string
): Promise<SongPeriodDetail | null> {
  const head = await queryOne<{
    title: string; album: string; isrc: string; artist_string: string;
    report_title: string; file_name: string; report_status: SongPeriodDetail["reportStatus"];
    period_label: string;
  }>(
    `select s.title, s.album, s.isrc, s.artist_string,
            r.title report_title, r.file_name, r.status report_status,
            p.label period_label
     from songs s
     cross join reports r
     cross join periods p
     where s.id = $1 and r.id = $2 and p.id = $3`,
    [songId, reportId, periodId]
  );
  if (!head) return null;

  const src = await creditsSource();

  // Temel (kalıcı) dağılım — credits tablosunun kendisi.
  const base = await query<{ artist_id: string; name: string; share: number; gross: number }>(
    `select c.artist_id, a.display_name name,
            max(c.share)::float8 share, sum(c.gross)::float8 gross
     from credits c join artists a on a.id = c.artist_id
     where c.song_id = $1 and c.report_id = $2 and c.period_id = $3
     group by c.artist_id, a.display_name`,
    [songId, reportId, periodId]
  );

  // Devirler uygulanmış dağılım.
  const eff = await query<{ artist_id: string; name: string; share: number; gross: number }>(
    `select c.artist_id, a.display_name name,
            sum(c.share)::float8 share, sum(c.gross)::float8 gross
     from ${src} c join artists a on a.id = c.artist_id
     where c.song_id = $1 and c.report_id = $2 and c.period_id = $3
     group by c.artist_id, a.display_name`,
    [songId, reportId, periodId]
  );

  const baseMap = new Map(base.map((r) => [r.artist_id, r]));
  const effMap = new Map(eff.map((r) => [r.artist_id, r]));
  const ids = new Set([...baseMap.keys(), ...effMap.keys()]);

  const artists: SongArtistRow[] = [...ids]
    .map((id) => {
      const b = baseMap.get(id);
      const e = effMap.get(id);
      return {
        artistId: id,
        artistName: b?.name ?? e?.name ?? "—",
        baseShare: b?.share ?? 0,
        effectiveShare: e?.share ?? 0,
        gross: e?.gross ?? 0,
        baseGross: b?.gross ?? 0,
      };
    })
    .sort((x, y) => y.baseShare - x.baseShare || y.gross - x.gross);

  const totalGross = base.reduce((s, r) => s + r.gross, 0);

  return {
    songId,
    title: head.title,
    album: head.album,
    isrc: head.isrc,
    artistString: head.artist_string,
    reportId,
    reportTitle: head.report_title || head.file_name,
    reportStatus: head.report_status,
    periodId,
    periodLabel: head.period_label,
    totalGross,
    artists,
    transfers: await listTransfers({ songId, reportId, periodId }),
  };
}

/**
 * Şarkı detayını çağıran kullanıcının görme yetkisine göre kısar.
 *
 * İki katman:
 *  1. Kullanıcının hiçbir sanatçısının geçmediği DÖNEMLER tamamen düşer —
 *     o dönemde şarkıyla hiçbir ilgisi yok demektir.
 *  2. Diğer sanatçıların TUTARLARI gizlenir (yüzdeler kalır), ancak
 *     kullanıcı label geneli görmeye yetkiliyse (canSeeOtherArtists)
 *     bu maskeleme uygulanmaz.
 */
export function redactForViewer(
  details: SongPeriodDetail[],
  ownArtistIds: string[],
  canSeeOthers: boolean
): SongPeriodDetail[] {
  const mine = new Set(ownArtistIds);
  return details
    .filter((d) => d.artists.some((a) => mine.has(a.artistId)))
    .map((d) => {
      if (canSeeOthers) return d;
      return {
        ...d,
        // Şarkının toplam geliri de başkalarının payını ele verir.
        totalGross: d.artists
          .filter((a) => mine.has(a.artistId))
          .reduce((s, a) => s + a.gross, 0),
        artists: d.artists.map((a) =>
          mine.has(a.artistId)
            ? a
            : { ...a, gross: 0, baseGross: 0, amountHidden: true }
        ),
        // Devir kayıtlarındaki tutarlar da aynı kurala tabi.
        transfers: d.transfers.map((tr) =>
          mine.has(tr.fromArtistId) || mine.has(tr.toArtistId)
            ? tr
            : { ...tr, amount: 0 }
        ),
      };
    });
}

export async function listTransfers(filter: {
  songId?: string;
  reportId?: string;
  periodId?: string;
  artistId?: string;
  limit?: number;
}): Promise<TransferRow[]> {
  // Migration 0009 henüz çalışmadıysa devir kavramı yok demektir — boş liste
  // döneriz, ham Postgres hatası değil.
  if (!(await transfersReady())) return [];

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("$?", `$${params.length}`)); };

  if (filter.songId) add("rt.song_id = $?", filter.songId);
  if (filter.reportId) add("rt.report_id = $?", filter.reportId);
  if (filter.periodId) add("rt.period_id = $?", filter.periodId);
  if (filter.artistId) {
    params.push(filter.artistId);
    where.push(`(rt.from_artist_id = $${params.length} or rt.to_artist_id = $${params.length})`);
  }
  params.push(filter.limit ?? 100);

  const rows = await query<{
    id: string; report_id: string; period_id: string; period_label: string;
    song_id: string; song_title: string;
    from_artist_id: string; from_name: string;
    to_artist_id: string; to_name: string;
    ratio: number; amount: number; status: "active" | "reverted";
    note: string | null; created_at: string; created_by_name: string | null;
    reverted_at: string | null;
  }>(
    `select rt.id, rt.report_id, rt.period_id, p.label period_label,
            rt.song_id, s.title song_title,
            rt.from_artist_id, fa.display_name from_name,
            rt.to_artist_id, ta.display_name to_name,
            rt.ratio::float8 ratio,
            coalesce((
              select sum(c.gross) * rt.ratio
              from credits c
              where c.song_id = rt.song_id and c.report_id = rt.report_id
                and c.period_id = rt.period_id and c.artist_id = rt.from_artist_id
            ), 0)::float8 amount,
            rt.status, rt.note, rt.created_at,
            u.first_name || ' ' || u.last_name as created_by_name,
            rt.reverted_at
     from revenue_transfers rt
     join songs s   on s.id = rt.song_id
     join periods p on p.id = rt.period_id
     join artists fa on fa.id = rt.from_artist_id
     join artists ta on ta.id = rt.to_artist_id
     left join users u on u.id = rt.created_by
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by rt.created_at desc
     limit $${params.length}`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    reportId: r.report_id,
    periodId: r.period_id,
    periodLabel: r.period_label,
    songId: r.song_id,
    songTitle: r.song_title,
    fromArtistId: r.from_artist_id,
    fromArtistName: r.from_name,
    toArtistId: r.to_artist_id,
    toArtistName: r.to_name,
    ratio: r.ratio,
    amount: r.amount,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    createdByName: r.created_by_name,
    revertedAt: r.reverted_at,
  }));
}

/* ------------------------------------------------------------- yazma */

export interface TransferInput {
  reportId: string;
  periodId: string;
  songId: string;
  fromArtistId: string;
  toArtistId: string;
  ratio: number;
  note?: string | null;
  createdBy: string | null;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
  id?: string;
  /** Devrin taşıdığı tutar — bildirim metninde kullanılır. */
  amount?: number;
}

/**
 * Devri oluşturur.
 *
 * Doğrulamalar (hepsi tek transaction içinde, yarış durumuna karşı satır
 * kilidiyle):
 *  1. Oran 0 < r ≤ 1
 *  2. Kaynak ≠ hedef
 *  3. Rapor kilitli olamaz — kilitli rapor ödemesi yapılmış geçmiştir
 *  4. Devreden sanatçının o şarkı+dönemde gerçekten kredisi olmalı
 *  5. Aynı şarkı+dönemde devredenin aktif oranları toplamı 1'i geçemez
 *  6. Devir sonrası, devredenin o dönemde ALDIĞI ödeme yeni hakedişini
 *     aşmamalı — aşarsa "ödenmiş parayı geri almış" gibi tutarsız bir
 *     bakiye oluşurdu
 */
export async function createTransfer(input: TransferInput): Promise<TransferResult> {
  const ratio = Number(input.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    return { ok: false, error: "Devredilen oran 0 ile 1 arasında olmalı." };
  }
  if (input.fromArtistId === input.toArtistId) {
    return { ok: false, error: "Bir sanatçı kendine devir yapamaz." };
  }
  if (!(await transfersReady())) {
    return {
      ok: false,
      error: "Gelir devri altyapısı henüz kurulmadı (0009 migration'ı çalıştırılmalı).",
    };
  }

  return transaction(async (c) => {
    const rep = await c.query<{ status: string }>(
      `select status from reports where id = $1 for update`,
      [input.reportId]
    );
    if (rep.rows.length === 0) return { ok: false, error: "Ödeme partisi bulunamadı." };
    if (rep.rows[0].status === "locked") {
      return { ok: false, error: "Bu ödeme partisi kilitli. Kilitli partide gelir devri yapılamaz." };
    }

    // Devredenin bu şarkı+dönemdeki kendi payı
    const own = await c.query<{ gross: number; share: number }>(
      `select coalesce(sum(gross),0)::float8 gross, coalesce(max(share),0)::float8 share
       from credits
       where song_id = $1 and report_id = $2 and period_id = $3 and artist_id = $4`,
      [input.songId, input.reportId, input.periodId, input.fromArtistId]
    );
    const ownGross = own.rows[0]?.gross ?? 0;
    if ((own.rows[0]?.share ?? 0) <= 0) {
      return { ok: false, error: "Devreden sanatçının bu şarkıda bu dönemde payı yok." };
    }

    // Devralan sanatçı gerçekten var mı?
    const to = await c.query(`select 1 from artists where id = $1`, [input.toArtistId]);
    if (to.rows.length === 0) return { ok: false, error: "Devralan sanatçı bulunamadı." };

    // Aktif oranlar toplamı
    const used = await c.query<{ total: number }>(
      `select coalesce(sum(ratio),0)::float8 total
       from revenue_transfers
       where song_id = $1 and report_id = $2 and period_id = $3
         and from_artist_id = $4 and status = 'active'
       for update`,
      [input.songId, input.reportId, input.periodId, input.fromArtistId]
    );
    const already = used.rows[0]?.total ?? 0;
    // 1e-9 tolerans: float toplamında 0.999999999 gibi değerler engel olmasın.
    if (already + ratio > 1 + 1e-9) {
      const kalan = Math.max(0, 1 - already);
      return {
        ok: false,
        error: `Bu şarkıda bu dönem için devredilebilecek pay kalmadı. Kalan: %${(kalan * 100).toFixed(1)}`,
      };
    }

    // Ödeme tutarlılığı: devirden sonra devredenin bu dönemdeki net hakedişi,
    // o döneme daha önce yapılmış ödemenin altına düşmemeli.
    const paidRow = await c.query<{ paid: number }>(
      `select coalesce(sum(pp.amount_usd),0)::float8 paid
       from payment_periods pp
       join payments pay on pay.id = pp.payment_id
       where pay.artist_id = $1 and pp.period_id = $2`,
      [input.fromArtistId, input.periodId]
    );
    const paid = paidRow.rows[0]?.paid ?? 0;
    if (paid > 0) {
      const cur = await c.query<{ net: number }>(
        `select coalesce(net,0)::float8 net from v_artist_period_net
         where artist_id = $1 and period_id = $2`,
        [input.fromArtistId, input.periodId]
      );
      const net = cur.rows[0]?.net ?? 0;
      // Devrin net karşılığı: brüt payın rapor net oranıyla ölçeklenmişi.
      const rate = await c.query<{ rate: number }>(
        `select case when gross <> 0 then (received / gross)::float8 else 1 end rate
         from reports where id = $1`,
        [input.reportId]
      );
      const netLoss = ownGross * ratio * (rate.rows[0]?.rate ?? 1);
      if (net - netLoss < paid - 0.005) {
        return {
          ok: false,
          error:
            "Bu devir, sanatçının bu dönemde zaten aldığı ödemenin altına düşmesine yol açar. " +
            "Önce ilgili ödeme kaydını geri al.",
        };
      }
    }

    const ins = await c.query<{ id: string }>(
      `insert into revenue_transfers
         (report_id, period_id, song_id, from_artist_id, to_artist_id, ratio, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id`,
      [
        input.reportId, input.periodId, input.songId,
        input.fromArtistId, input.toArtistId, ratio,
        input.note ?? null, input.createdBy,
      ]
    );

    return { ok: true, id: ins.rows[0].id, amount: ownGross * ratio };
  });
}

/**
 * Devri geri alır — orijinal veri hiç bozulmadığı için tam eski hâle döner.
 *
 * createTransfer ile AYNI kilitleme disiplini: tüm okuma-karar-yazma zinciri
 * tek transaction içinde ve rapor satırı `for update` ile kilitli. Kilitsiz
 * yazılsaydı, "rapor kilitli mi" ve "ödenmiş tutarın altına düşer mi"
 * kontrolleri ile asıl UPDATE arasında araya giren bir ödeme kaydı ya da
 * kilitleme işlemi, korumayı bayat bir anlık görüntüye dayandırırdı.
 */
export async function revertTransfer(
  id: string,
  userId: string | null
): Promise<TransferResult> {
  if (!(await transfersReady())) {
    return { ok: false, error: "Gelir devri altyapısı henüz kurulmadı." };
  }

  return transaction(async (c) => {
    const rowRes = await c.query<{
      id: string; status: string; report_id: string; from_artist_id: string;
      to_artist_id: string; song_id: string; period_id: string; ratio: number;
    }>(
      `select rt.id, rt.status, rt.report_id, rt.from_artist_id, rt.to_artist_id,
              rt.song_id, rt.period_id, rt.ratio::float8 ratio
       from revenue_transfers rt where rt.id = $1 for update`,
      [id]
    );
    const row = rowRes.rows[0];
    if (!row) return { ok: false, error: "Devir kaydı bulunamadı." };
    if (row.status !== "active") return { ok: false, error: "Bu devir zaten geri alınmış." };

    // Rapor satırını kilitle — createTransfer ile aynı serileştirme noktası.
    const rep = await c.query<{ status: string; rate: number }>(
      `select status,
              case when gross <> 0 then (received / gross)::float8 else 1 end rate
       from reports where id = $1 for update`,
      [row.report_id]
    );
    if (rep.rows.length === 0) return { ok: false, error: "Ödeme partisi bulunamadı." };
    if (rep.rows[0].status === "locked") {
      return { ok: false, error: "Kilitli ödeme partisindeki devir geri alınamaz." };
    }

    // Geri alma devralanın hakedişini düşürür — devralan o dönemde ödeme
    // almışsa tutarsızlık ters yönde oluşur; onu da engelliyoruz.
    const paidRes = await c.query<{ paid: number }>(
      `select coalesce(sum(pp.amount_usd),0)::float8 paid
       from payment_periods pp join payments pay on pay.id = pp.payment_id
       where pay.artist_id = $1 and pp.period_id = $2`,
      [row.to_artist_id, row.period_id]
    );
    const paid = paidRes.rows[0]?.paid ?? 0;

    if (paid > 0) {
      const curRes = await c.query<{ net: number }>(
        `select coalesce(net,0)::float8 net from v_artist_period_net
         where artist_id = $1 and period_id = $2`,
        [row.to_artist_id, row.period_id]
      );
      const gainedRes = await c.query<{ g: number }>(
        `select coalesce(sum(c.gross),0)::float8 * $5::float8 g
         from credits c
         where c.song_id = $1 and c.report_id = $2 and c.period_id = $3 and c.artist_id = $4`,
        [row.song_id, row.report_id, row.period_id, row.from_artist_id, row.ratio]
      );
      const netLoss = (gainedRes.rows[0]?.g ?? 0) * (rep.rows[0].rate ?? 1);
      if ((curRes.rows[0]?.net ?? 0) - netLoss < paid - 0.005) {
        return {
          ok: false,
          error:
            "Bu devri geri almak, devralan sanatçının bu dönemde aldığı ödemenin " +
            "altına düşmesine yol açar. Önce ilgili ödeme kaydını geri al.",
        };
      }
    }

    await c.query(
      `update revenue_transfers
         set status = 'reverted', reverted_at = now(), reverted_by = $2
       where id = $1 and status = 'active'`,
      [id, userId]
    );
    return { ok: true, id };
  });
}
