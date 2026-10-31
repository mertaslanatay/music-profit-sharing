/**
 * Kural: yönetici olmayan hiç kimse başka bir sanatçının hakedişini görmez
 * (label toplamlarını görme yetkisi olsa bile).  npx tsx scripts/verify-redact.mts
 */
import { canAccessArtist, scopeFor, type Viewer } from "../src/lib/access";
import { redactOtherArtists } from "../src/lib/redact";
import type { ArtistAgg, Result } from "../src/lib/types";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

const base: Omit<Viewer, "role" | "artistIds" | "labelIds" | "canSeeOtherArtists" | "canSeeLabelTotals"> =
  { userId: "u", email: "e", fullName: "f", status: "active", mfaOk: true };
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const L = "33333333-3333-3333-3333-333333333333";

const admin: Viewer = { ...base, role: "admin", artistIds: [], labelIds: [], canSeeOtherArtists: false, canSeeLabelTotals: false };
const wide: Viewer = { ...base, role: "artist", artistIds: [A], labelIds: [L], canSeeOtherArtists: true, canSeeLabelTotals: true };
const solo: Viewer = { ...base, role: "artist", artistIds: [A], labelIds: [], canSeeOtherArtists: false, canSeeLabelTotals: false };
const mgr: Viewer = { ...base, role: "label_manager", artistIds: [], labelIds: [L], canSeeOtherArtists: false, canSeeLabelTotals: true };

console.log("\n=== API: sanatçıya özel kaynaklar ===");
check("yönetici herkese erişir", canAccessArtist(admin, A) && canAccessArtist(admin, B));
check("label geneli sanatçı kendine erişir", canAccessArtist(wide, A));
check("label geneli sanatçı BAŞKASINA erişemez (döküm/IBAN)", !canAccessArtist(wide, B));
check("tek sanatçı başkasına erişemez", !canAccessArtist(solo, B));
check("label yöneticisi hiçbir sanatçıya erişemez", !canAccessArtist(mgr, A) && !canAccessArtist(mgr, B));
check("label geneli sanatçının panel KAPSAMI hâlâ label geneli (toplamlar görünür)",
  scopeFor(wide).artistIds === null && JSON.stringify(scopeFor(wide).labelIds) === JSON.stringify([L]));

console.log("\n=== Panel verisi: sunucuda süzme ===");
const agg = (id: string, name: string, net: number) => ({ id, key: name.toLowerCase(), name, net, gross: net } as unknown as ArtistAgg);
const res = {
  artists: [agg(A, "Ben", 10), agg(B, "Diğer", 99)],
  labels: [{ label: "M4NM", gross: 109, net: 109, quantity: 0, artistCount: 2, songCount: 3,
             topArtists: [{ name: "Diğer", gross: 99 }, { name: "Ben", gross: 10 }] }],
  songs: [{ key: "s", gross: 109 }], combos: [], aliasSuggestions: [{}],
  totals: { gross: 109, received: 100, artistCount: 2 },
} as unknown as Result;
const r = redactOtherArtists(res, wide.artistIds);
check("yalnızca kendi sanatçı satırı kalır", r.artists.length === 1 && r.artists[0].id === A);
check("label kartında diğer sanatçının geliri yok", r.labels[0].topArtists.every((t) => t.name === "Ben"));
check("label toplamı korunur", r.labels[0].gross === 109 && r.totals.received === 100);
check("şarkı gelirleri korunur", r.songs.length === 1);
check("önbellekteki nesne değişmez (kopya)", res.artists.length === 2 && res.labels[0].topArtists.length === 2);
const m = redactOtherArtists(res, mgr.artistIds);
check("label yöneticisi hiçbir sanatçı satırı almaz", m.artists.length === 0 && m.labels[0].topArtists.length === 0);
check("label yöneticisi toplamları görür", m.totals.gross === 109);

console.log(`\n${fail === 0 ? "TÜMÜ GEÇTİ" : "HATA VAR"} — ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
