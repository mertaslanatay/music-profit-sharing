import { query, queryOne, transaction } from "./db";
import { songSplitsReady } from "./schema";
import { isAdmin, type Viewer } from "./access";
import { notify, usersForArtist } from "./notify";

/**
 * Şarkı bazlı KALICI bölüşüm düzenleme (M4NM Pulse, şartname sonrası madde 5).
 *
 * revenue_transfers'tan (Faz C) FARKI: o dönem bazlı ve geçicidir ("bu
 * dönemde payımın şu kadarını devret"). Bu ise şarkı bazlı ve kalıcıdır
 * ("bu şarkının doğru sahiplik yapısı budur") — 0013 migration'ındaki
 * song_splits tablosu + v_credits_split görünümü üzerinden çalışır.
 *
 * Yetki: yalnızca şarkının ORİJİNAL ana sanatçısı (ingest'teki position=0 —
 * bölüşüm sonradan değişse bile bu değişmez, "yetkili kişi" tanımı budur),
 * o şarkının label'ına yetkili bir label yöneticisi/muhasebeci, ya da admin
 * düzenleyebilir.
 */

export interface SongSplitArtistRow {
  artistId: string;
  artistName: string;
  share: number;
  position: number;
}

export interface SongSplitDetail {
  songId: string;
  title: string;
  album: string;
  isrc: string;
  artistString: string;
  /** song_splits'te bu şarkı için özel bir bölüşüm kayıtlı mı? */
  hasOverride: boolean;
  /** Güncel roster — override varsa oradan, yoksa credits türevinden. */
  roster: SongSplitArtistRow[];
  /** İngest'teki position=0 sanatçı — düzenleme yetkisinin dayandığı kişi. */
  primaryArtistId: string | null;
  primaryArtistName: string | null;
}

/** Bir şarkının güncel (override varsa override, yoksa credits türevi) rosterunu döner. */
export async function songSplitDetail(songId: string): Promise<SongSplitDetail | null> {
  const head = await queryOne<{
    title: string; album: string; isrc: string; artist_string: string;
  }>(
    `select title, album, isrc, artist_string from songs where id = $1`,
    [songId]
  );
  if (!head) return null;

  // Orijinal ana sanatçı — en son ingest edilen raporun position=0 satırı.
  // Bölüşüm sonradan değişse bile bu "yetkili kişi" tanımı sabit kalır.
  const primary = await queryOne<{ artist_id: string; name: string }>(
    `select c.artist_id, a.display_name name
     from credits c
     join artists a on a.id = c.artist_id
     join reports r on r.id = c.report_id
     where c.song_id = $1 and c.position = 0
     order by r.created_at desc
     limit 1`,
    [songId]
  );

  const overrideRows = await query<{ artist_id: string; name: string; share: number; position: number }>(
    `select ss.artist_id, a.display_name name, ss.share::float8 share, ss.position
     from song_splits ss join artists a on a.id = ss.artist_id
     where ss.song_id = $1
     order by ss.position, ss.share desc`,
    [songId]
  );

  let roster: SongSplitArtistRow[];
  const hasOverride = overrideRows.length > 0;
  if (hasOverride) {
    roster = overrideRows.map((r) => ({
      artistId: r.artist_id, artistName: r.name, share: r.share, position: r.position,
    }));
  } else {
    const derived = await query<{ artist_id: string; name: string; share: number; position: number }>(
      `select distinct on (c.artist_id) c.artist_id, a.display_name name,
              c.share::float8 share, c.position
       from credits c
       join artists a on a.id = c.artist_id
       join reports r on r.id = c.report_id
       where c.song_id = $1
       order by c.artist_id, r.created_at desc`,
      [songId]
    );
    roster = derived
      .map((r) => ({ artistId: r.artist_id, artistName: r.name, share: r.share, position: r.position }))
      .sort((a, b) => a.position - b.position || b.share - a.share);
  }

  return {
    songId,
    title: head.title,
    album: head.album,
    isrc: head.isrc,
    artistString: head.artist_string,
    hasOverride,
    roster,
    primaryArtistId: primary?.artist_id ?? null,
    primaryArtistName: primary?.name ?? null,
  };
}

/**
 * Bir şarkının credits'inde geçen label(lar)a ait TÜM sanatçılar — "label'daki
 * sanatçılardan birini ekle" araması için aday listesi.
 *
 * ÖNEMLİ: artists tablosunda doğrudan label_id yok (şema kasıtlı böyle —
 * label ilişkisi yalnızca credits.label_id üzerinden, satır bazında). Bu
 * yüzden "bir label'ın sanatçıları" = "o label_id ile en az bir credits
 * satırı olan sanatçılar" olarak tanımlanır.
 */
export async function labelArtistsForSong(
  songId: string
): Promise<{ artistId: string; artistName: string }[]> {
  const rows = await query<{ id: string; display_name: string }>(
    `select distinct a.id, a.display_name
     from credits c
     join artists a on a.id = c.artist_id
     where c.label_id in (select distinct label_id from credits where song_id = $1)
     order by a.display_name`,
    [songId]
  );
  return rows.map((r) => ({ artistId: r.id, artistName: r.display_name }));
}

/** Bu kullanıcı bu şarkının bölüşümünü DÜZENLEYEBİLİR mi? */
export async function canEditSongSplit(
  v: Viewer | null,
  songId: string,
  primaryArtistId: string | null
): Promise<boolean> {
  if (isAdmin(v)) return true;
  if (!v || v.status !== "active") return false;
  if (v.role === "label_manager" || v.role === "accountant") {
    if (v.labelIds.length === 0) return false;
    const row = await queryOne<{ ok: boolean }>(
      `select exists(select 1 from credits where song_id = $1 and label_id = any($2::uuid[])) as ok`,
      [songId, v.labelIds]
    );
    return !!row?.ok;
  }
  if (v.role === "artist") {
    if (!primaryArtistId) return false;
    // ÖNEMLİ: canAccessArtist() BİLİNÇLİ OLARAK KULLANILMIYOR — canSeeOtherArtists
    // açık bir kullanıcı için o, kısıtı tamamen kaldırıp HERHANGİ bir sanatçı
    // kimliğini "erişilebilir" sayar (bkz. access.ts scopeFor: artistIds=null
    // demek "kısıt yok" demektir, "sadece kendi label'ı" değil). Bu yazma
    // yolunda bunu kullanmak, bir gruba ait "diğerlerini de görebilsin"
    // ayarına sahip herhangi bir sanatçının BAŞKA BİR LABEL'IN şarkısının
    // bölüşümünü ele geçirmesine izin verirdi. src/app/api/transfers/route.ts
    // aynı nedenle aynı şekilde ham artistIds listesine bakıyor — o desenle
    // tutarlı kalıyoruz.
    return v.artistIds.includes(primaryArtistId);
  }
  return false;
}

/** Bu kullanıcı bu şarkının bölüşüm detayını GÖREBİLİR mi? */
export async function canViewSongSplit(
  v: Viewer | null,
  songId: string,
  rosterArtistIds: string[]
): Promise<boolean> {
  if (isAdmin(v)) return true;
  if (!v || v.status !== "active") return false;
  if (v.role === "label_manager" || v.role === "accountant") {
    if (v.labelIds.length === 0) return false;
    const row = await queryOne<{ ok: boolean }>(
      `select exists(select 1 from credits where song_id = $1 and label_id = any($2::uuid[])) as ok`,
      [songId, v.labelIds]
    );
    return !!row?.ok;
  }
  // Kendi rosterunda geçiyor mu?
  if (rosterArtistIds.some((id) => v.artistIds.includes(id))) return true;
  // Label geneline yetkilendirilmiş sanatçı (canSeeOtherArtists): kendi
  // label'ındaki bir şarkıyı, o şarkıda kendisi geçmese bile görebilmeli —
  // tıpkı diğer ekranlarda (transfers.ts: redactForViewer) olduğu gibi.
  if (v.canSeeOtherArtists && v.labelIds.length > 0) {
    const row = await queryOne<{ ok: boolean }>(
      `select exists(select 1 from credits where song_id = $1 and label_id = any($2::uuid[])) as ok`,
      [songId, v.labelIds]
    );
    return !!row?.ok;
  }
  return false;
}

/* ------------------------------------------------------------- yazma */

export interface SetSongSplitInput {
  songId: string;
  /** null = override'ı tamamen kaldır, credits türevi doğal roster'a dön. */
  roster: { artistId: string; share: number }[] | null;
  updatedBy: string | null;
}

export interface SetSongSplitResult {
  ok: boolean;
  error?: string;
  affectedArtistIds?: string[];
  affectedPeriodIds?: string[];
}

class SplitGuardError extends Error {}

interface TxResult {
  songTitle: string;
  before: { artistId: string; artistName: string; share: number }[];
  after: { artistId: string; artistName: string; share: number }[];
  affectedArtistIds: string[];
  affectedPeriodIds: string[];
}

/**
 * Bir şarkının bölüşümünü KALICI olarak değiştirir.
 *
 * Onaylanan kurallar (M4NM Pulse şartname sonrası madde 5):
 *  1. Anında uygulanır (ayrı bir "yeniden hesapla" adımı yok — v_credits_split
 *     zaten okuma anında uyguluyor).
 *  2. Yayındaki (kilitsiz — draft + published) dönemler hemen etkilenir;
 *     kilitli dönemler asla etkilenmez (view seviyesinde garanti).
 *  3. Zaten ödenmiş tutarın altına düşüren değişiklik ENGELLENİR — Faz C
 *     (revenue_transfers) korumasıyla aynı mantık.
 *  4. Etkilenen herkese bildirim + audit log (recalc_log'un ilk kullanımı).
 *
 * Doğrulama stratejisi: guard kontrolünü elle SQL'de tekrar yazıp
 * v_credits_split/v_credits_effective'in mantığını iki kez sürdürmek yerine,
 * yeni roster'ı transaction İÇİNDE yazıp GERÇEK görünümlerden (v_artist_period_net)
 * "sonrası" değerini okuyoruz; ihlal varsa transaction'ı THROW ile geri
 * alıyoruz. Böylece guard, view'ın kendisiyle asla tutarsız düşemez.
 */
export async function setSongSplit(input: SetSongSplitInput): Promise<SetSongSplitResult> {
  const isReset = input.roster === null;
  // artistId'ler normalize edilir (küçük harf): UUID karşılaştırması Postgres'te
  // büyük/küçük harften bağımsızdır, ama JS tarafındaki Set/Map anahtarları
  // ham string olduğu için farklı harf durumundaki AYNI kimlik yinelenen
  // sanılmayabilir (ya da tam tersi, tekilmiş gibi görünüp veritabanındaki
  // unique kısıtına çarpabilir). Tüm karşılaştırma ve yazma bu normalize
  // edilmiş haliyle yapılır.
  const roster = isReset
    ? null
    : (input.roster as { artistId: string; share: number }[]).map((r) => ({
        artistId: String(r.artistId).toLowerCase(),
        share: Number(r.share),
      }));
  if (roster) {
    if (roster.length === 0) return { ok: false, error: "En az bir hak sahibi olmalı." };
    const ids = roster.map((r) => r.artistId);
    if (new Set(ids).size !== ids.length) {
      return { ok: false, error: "Aynı sanatçı listede birden fazla kez var." };
    }
    for (const r of roster) {
      if (!Number.isFinite(r.share) || r.share <= 0 || r.share > 1) {
        return { ok: false, error: "Her payın oranı 0 ile 1 arasında olmalı." };
      }
    }
    const sum = roster.reduce((s, r) => s + r.share, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      return { ok: false, error: `Paylar toplamı 1 olmalı (şu an: ${sum.toFixed(6)}).` };
    }
  }
  if (!(await songSplitsReady())) {
    return { ok: false, error: "Bölüşüm düzenleme altyapısı henüz kurulmadı (0013 migration'ı çalıştırılmalı)." };
  }

  let result: TxResult;
  try {
    result = await transaction(async (c) => {
      const songRow = await c.query<{ id: string; title: string }>(
        `select id, title from songs where id = $1 for update`,
        [input.songId]
      );
      if (songRow.rows.length === 0) throw new SplitGuardError("Şarkı bulunamadı.");
      const songTitle = songRow.rows[0].title;

      const nameOf = new Map<string, string>();

      if (roster) {
        const rosterIds = roster.map((r) => r.artistId);
        const artistRows = await c.query<{ id: string; display_name: string }>(
          `select id, display_name from artists where id = any($1::uuid[])`,
          [rosterIds]
        );
        if (artistRows.rows.length !== rosterIds.length) {
          throw new SplitGuardError("Seçilen sanatçılardan biri bulunamadı.");
        }
        for (const r of artistRows.rows) nameOf.set(r.id, r.display_name);
      }

      // Şu anki durum (override varsa override, yoksa credits türevi) —
      // "önce" olarak audit/bildirimde kullanılır. Reset modunda ayrıca
      // "sıfırlanacak bir şey var mı" kontrolü için de kullanılır.
      //
      // ÖNEMLİ: artists'e JOIN edilerek isim de burada çekilir — roster
      // (normal düzenleme) modunda nameOf zaten dolu olsa da, reset
      // modunda YUKARIDAKİ if(roster) bloğu hiç çalışmadığı için nameOf
      // bomboş kalırdı; bu satır olmazsa hata mesajları ve recalc_log
      // "önce" isimleri yerine ham UUID gösterirdi.
      const overrideBefore = await c.query<{ artist_id: string; name: string; share: number }>(
        `select ss.artist_id, a.display_name name, ss.share::float8 share
         from song_splits ss join artists a on a.id = ss.artist_id
         where ss.song_id = $1
         for update of ss`,
        [input.songId]
      );
      if (isReset && overrideBefore.rows.length === 0) {
        throw new SplitGuardError("Bu şarkının zaten özel bir bölüşümü yok — sıfırlanacak bir şey bulunmuyor.");
      }
      for (const r of overrideBefore.rows) nameOf.set(r.artist_id, r.name);

      const deriveNatural = async (): Promise<
        { artistId: string; artistName: string; share: number }[]
      > => {
        const derived = await c.query<{ artist_id: string; name: string; share: number }>(
          `select distinct on (c.artist_id) c.artist_id, a.display_name name, c.share::float8 share
           from credits c join artists a on a.id = c.artist_id
           join reports r on r.id = c.report_id
           where c.song_id = $1
           order by c.artist_id, r.created_at desc`,
          [input.songId]
        );
        return derived.rows.map((r) => ({ artistId: r.artist_id, artistName: r.name, share: r.share }));
      };

      let before: { artistId: string; artistName: string; share: number }[];
      if (overrideBefore.rows.length > 0) {
        before = overrideBefore.rows.map((r) => ({
          artistId: r.artist_id, artistName: nameOf.get(r.artist_id) ?? r.artist_id, share: r.share,
        }));
      } else {
        before = await deriveNatural();
      }
      for (const b of before) if (!nameOf.has(b.artistId)) nameOf.set(b.artistId, b.artistName);

      const after: { artistId: string; artistName: string; share: number }[] = roster
        ? roster.map((r) => ({ artistId: r.artistId, artistName: nameOf.get(r.artistId) ?? "—", share: r.share }))
        : await deriveNatural();
      for (const a of after) if (!nameOf.has(a.artistId)) nameOf.set(a.artistId, a.artistName);

      const ids = after.map((a) => a.artistId);
      const newIdSet = new Set(ids);

      // Bu şarkıda aktif bir gelir devri varsa ve devreden yeni roster'da
      // yoksa: devir, yeni durumda anlamsız (hiçbir paydan devredilemez)
      // kalırdı — bu belirsizliği engelliyoruz, önce devir geri alınmalı.
      const activeFrom = await c.query<{ from_artist_id: string }>(
        `select distinct rt.from_artist_id
         from revenue_transfers rt join reports r on r.id = rt.report_id
         where rt.song_id = $1 and rt.status = 'active' and r.status <> 'locked'`,
        [input.songId]
      );
      for (const row of activeFrom.rows) {
        if (!newIdSet.has(row.from_artist_id)) {
          throw new SplitGuardError(
            `${nameOf.get(row.from_artist_id) ?? "Bir sanatçının"} bu şarkıda aktif bir gelir hakkı devri var; ` +
            `devreden yeni bölüşümden çıkarılamaz. Önce ilgili devri geri al.`
          );
        }
      }

      // Etkilenen (kilitsiz) dönemler.
      const affected = await c.query<{ period_id: string; status: string }>(
        `select distinct c.period_id, r.status
         from credits c join reports r on r.id = c.report_id
         where c.song_id = $1 and r.status <> 'locked'`,
        [input.songId]
      );
      const affectedPeriodIds = [...new Set(affected.rows.map((r) => r.period_id))];
      const publishedPeriodIds = [...new Set(
        affected.rows.filter((r) => r.status === "published").map((r) => r.period_id)
      )];

      const affectedArtistIds = [...new Set([...before.map((b) => b.artistId), ...ids])].sort();

      // Advisory kilit — bu düzenlemeden etkilenen HER sanatçı için, SABİT
      // (alfabetik) sırayla. Amaç: eşzamanlı bir ödeme kaydı (recordPayment,
      // src/lib/payments.ts) ya da BAŞKA bir şarkının bölüşüm düzenlemesi,
      // bu transaction'ın az sonra okuyacağı "ödenmiş tutar" / "net hakediş"
      // değerlerini altından değiştiremesin — aksi hâlde iki işlem birbirinin
      // COMMIT'ini görmeden kendi guard'ını geçip ikisi birden uygulanınca
      // sanatçı ödenmiş tutarın altına düşebilirdi. Kilitler transaction
      // sonunda (commit/rollback) otomatik bırakılır. Her zaman aynı
      // (alfabetik) sırayla kilitlenmesi, iki çoklu-kilitleme işlemi
      // arasında çıkmazı (deadlock) yapısal olarak imkânsız kılar;
      // recordPayment tek bir sanatçı kilitlediği için zaten sırasız
      // güvenlidir.
      for (const artistId of affectedArtistIds) {
        await c.query(`select pg_advisory_xact_lock(hashtext($1::uuid::text)::bigint)`, [artistId]);
      }

      // Ödeme koruması — sadece yayınlanmış (published) dönemlerde anlamlı;
      // draft henüz ödeme zincirine girmemiştir, locked zaten dokunulmuyor.
      let paidMap = new Map<string, number>();
      if (publishedPeriodIds.length > 0 && affectedArtistIds.length > 0) {
        const paidRows = await c.query<{ artist_id: string; period_id: string; paid: number }>(
          `select pay.artist_id, pp.period_id, sum(pp.amount_usd)::float8 paid
           from payment_periods pp join payments pay on pay.id = pp.payment_id
           where pay.artist_id = any($1::uuid[]) and pp.period_id = any($2::uuid[])
           group by pay.artist_id, pp.period_id`,
          [affectedArtistIds, publishedPeriodIds]
        );
        paidMap = new Map(paidRows.rows.map((r) => [`${r.artist_id}|${r.period_id}`, r.paid]));
      }

      // ---- YAZMA: roster'ın tamamı tek transaction'da silinip yeniden yazılır ----
      // (reset modunda yalnızca silme yeterli — override tamamen kalkar,
      // view otomatik olarak credits türevine döner.)
      try {
        await c.query(`delete from song_splits where song_id = $1`, [input.songId]);
        if (roster) {
          // position: paya göre büyükten küçüğe sıralanmış indeks. Sabit 0
          // bırakılsaydı v_credits_split'teki total_artists/position her
          // ortak yapımda "herkes ana sanatçı" gibi görünüp dashboard'daki
          // ana/feat kırılımını bozardı (bkz. queries.ts primary_gross).
          const ordered = [...roster].sort((x, y) => y.share - x.share);
          for (let i = 0; i < ordered.length; i++) {
            const r = ordered[i];
            await c.query(
              `insert into song_splits (song_id, artist_id, share, position, updated_by)
               values ($1,$2,$3,$4,$5)`,
              [input.songId, r.artistId, r.share, i, input.updatedBy]
            );
          }
        }
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (code === "23505") {
          throw new SplitGuardError("Aynı sanatçı listede birden fazla kez var.");
        }
        throw e;
      }

      // ---- DOĞRULAMA: yazımdan SONRA, GERÇEK görünümden oku ----
      // (Guard mantığını elle tekrarlamak yerine v_artist_period_net'in
      // kendisine soruyoruz — böylece view'ın davranışıyla asla ayrışamaz.)
      if (paidMap.size > 0) {
        const netAfter = await c.query<{ artist_id: string; period_id: string; net: number }>(
          `select artist_id, period_id, net::float8 net
           from v_artist_period_net
           where artist_id = any($1::uuid[]) and period_id = any($2::uuid[])`,
          [affectedArtistIds, publishedPeriodIds]
        );
        const netAfterMap = new Map(netAfter.rows.map((r) => [`${r.artist_id}|${r.period_id}`, r.net]));
        for (const [key, paid] of paidMap) {
          if (paid <= 0) continue;
          const net = netAfterMap.get(key) ?? 0;
          if (net < paid - 0.005) {
            const [artistId] = key.split("|");
            throw new SplitGuardError(
              `Bu değişiklik, ${nameOf.get(artistId) ?? "bir sanatçının"} zaten aldığı ödemenin altına ` +
              `düşmesine yol açar. Önce ilgili ödeme kaydını geri al.`
            );
          }
        }
      }

      return { songTitle, before, after, affectedArtistIds, affectedPeriodIds };
    });
  } catch (e) {
    if (e instanceof SplitGuardError) return { ok: false, error: e.message };
    throw e;
  }

  // ---- Transaction başarıyla COMMIT edildi. Şimdi bildirim + audit. ----
  // (notify()/recalc_log kendi hatalarını yutar — ana işlemi asla düşürmez,
  // audit()/notify() genelindeki mevcut felsefeyle aynı.)
  const beforeMap = new Map(result.before.map((b) => [b.artistId, b.share]));
  const afterMap = new Map(result.after.map((a) => [a.artistId, a.share]));

  await Promise.all(
    result.affectedArtistIds.map(async (artistId) => {
      const oldShare = beforeMap.get(artistId) ?? 0;
      const newShare = afterMap.get(artistId) ?? 0;
      if (Math.abs(oldShare - newShare) < 1e-9) return; // payı değişmeyenlere bildirim yok
      const userIds = await usersForArtist(artistId);
      if (userIds.length === 0) return;
      const pct = (x: number) => `%${(x * 100).toFixed(1)}`;
      const body =
        newShare === 0
          ? `"${result.songTitle}" şarkısındaki payın (${pct(oldShare)}) kaldırıldı.`
          : oldShare === 0
          ? `"${result.songTitle}" şarkısında ${pct(newShare)} pay sahibi oldun.`
          : `"${result.songTitle}" şarkısındaki payın ${pct(oldShare)} → ${pct(newShare)} olarak güncellendi.`;
      await Promise.all(
        userIds.map((userId) =>
          notify({
            userId,
            type: "song_split",
            title: "Şarkı bölüşümü güncellendi",
            body,
            resource: `song:${input.songId}`,
            actionUrl: "/?v=songs",
            meta: { songId: input.songId, oldShare, newShare },
            createdBy: input.updatedBy,
          })
        )
      );
    })
  );

  try {
    await query(
      `insert into recalc_log (report_id, from_version, to_version, changed_by, diff)
       values (null, null, null, $1, $2::jsonb)`,
      [
        input.updatedBy,
        JSON.stringify({
          kind: "song_split",
          songId: input.songId,
          songTitle: result.songTitle,
          before: result.before,
          after: result.after,
          affectedPeriodIds: result.affectedPeriodIds,
        }),
      ]
    );
  } catch (e) {
    console.error("[songSplits] recalc_log yazılamadı:", e);
  }

  return {
    ok: true,
    affectedArtistIds: result.affectedArtistIds,
    affectedPeriodIds: result.affectedPeriodIds,
  };
}
