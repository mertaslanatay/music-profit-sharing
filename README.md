# Müzik Gelir Dağılımı

Virgin Music dağıtım raporlarından sanatçı hakedişlerini hesaplayan web uygulaması.
Excel'i sürükle-bırak, ortak şarkı bölüşümlerini ve SWIFT kesintisini otomatik hesapla.

**Dosya hiçbir sunucuya gönderilmez** — Excel tamamen tarayıcıda işlenir.

## Nasıl çalışır

### 1. Hesaplama tabanı

Raporun **`Net Dollars after Fees`** sütunu esas alınır. Kolon başlıkları farklı gelirse
uygulama bir eşleştirme ekranı açar ve hangi sütunun ne olduğunu sorar.

### 2. Sanatçı ayrıştırma

`Artist` sütunundaki dizi tek tek isimlere bölünür. **Dizideki ilk isim her zaman ana
sanatçıdır.**

| Girdi | Sonuç |
|---|---|
| `Ağaçkakan, Oldeaf` | Ağaçkakan *(ana)*, Oldeaf |
| `Ağaçkakan, Emiladil feat. Barış Demirel` | Ağaçkakan *(ana)*, Emiladil, Barış Demirel |
| `Ağaçkakan x Savai x Emiladil` | Ağaçkakan *(ana)*, Savai, Emiladil |
| `Armonycoma or slt` | Armonycoma or slt — bölünmez |
| `Herkestam feat. Nilipek.` | Herkestam *(ana)*, Nilipek. — sondaki nokta korunur |

Ayırıcılar (`,` `feat.` `ft.` `featuring` ` x ` `&` `vs.` `/`) Kurallar ekranından
tek tek açılıp kapatılabilir.

### 3. Bölüşüm

Varsayılan **eşit bölüşüm**: 2 isim → %50/%50, 3 isim → %33,3 her biri.
Kurallar → Özel Oranlar ekranından belirli bir yapıma kendi oranını girebilirsin
(örn. 70/20/10). Girilen oranlar tarayıcıda saklanır ve sonraki yüklemelerde
otomatik uygulanır.

### 4. İsim normalizasyonu

Türkçe-duyarlı eşleştirme sayesinde aynı sanatçının farklı yazımları otomatik birleşir:

- `AĞAÇKAKAN` = `Ağaçkakan` — Türkçe büyük harf (ı/İ tuzağı dahil)
- `hrsz` = `Hrsz`, `Document1` = `document1`
- Diakritikler katlanır: ğ→g, ç→c, ş→s, ı→i, ö→o, ü→u

Emin olunamayan eşleşmeler (`Agackakan YugoslavFaulu Live 4K` → `Ağaçkakan` gibi)
öneri olarak sunulur; **kullanıcı onaylamadan birleştirme yapılmaz.**

### 5. Oransal (pro-rata) SWIFT kesintisi

Bankaya fiilen yatan tutarı girersin, gerisi otomatik:

```
Kesinti      = Brüt Toplam − Yatan Tutar
Net Oran     = Yatan Tutar / Brüt Toplam
Net Hakediş  = Brüt Hakediş × Net Oran
```

Banka masrafı sanatçı sayısına değil **kazanca göre** paylaştırılır — çok kazanan
masrafın büyük kısmını, az kazanan küçük kısmını üstlenir.

Yuvarlama en büyük kalan yöntemiyle yapılır: dağıtılan net tutarların toplamı
**tam olarak** yatan tutara eşittir ve hiçbir sanatçının net tutarı matematiksel
değerinden 1 kuruştan fazla sapmaz.

## Ekranlar

| Ekran | İçerik |
|---|---|
| **Panel** | KPI kartları, sanatçı hakedişleri, label dağılımı, platform/ülke/şarkı kırılımı |
| **Ödeme Listesi** | Brüt / kesinti / net tablo, label filtresi, sıralama, arama |
| **Şarkılar** | Şarkı bazında gelir, ortak yapım filtresi |
| **Label** | M4NM, Black Pigeon Records… label bazında gelir ve sanatçı listesi |
| **Coğrafya** | Ülke kırılımı — genel veya seçilen sanatçı için |
| **Platformlar** | Spotify, YouTube, Apple Music… kırılımı |
| **Kurallar** | Ayırıcılar, özel oranlar, isim birleştirme |

Bir sanatçıya tıklayınca sağdan hakediş dökümü paneli açılır: şarkı bazında katkı,
bölüşüm gerekçesi, ülke ve platform kırılımı, birlikte çalıştığı sanatçılar.
Döküm panoya kopyalanabilir veya PDF olarak yazdırılabilir.

**Excel indir** butonu 7 sekmelik dosya üretir: Özet · Ödeme Listesi · Label ·
Şarkılar · Bölüşüm Detayı · Ülke · Platform.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

### Testler

Hesaplama motoru gerçek bir rapor dosyasıyla doğrulanır (64 kontrol):

```bash
npx tsx scripts/verify.ts /yol/rapor.xlsx
```

Kolon eşleştirme, sanatçı ayrıştırma, Türkçe normalizasyon, toplam korunumu,
pro-rata kuruş hassasiyeti, özel oranlar ve isim birleştirme test edilir.

Tarayıcı testi (ekran görüntüsü üretir):

```bash
npm run build && npx next start -p 3111 &
node scripts/uitest.mjs /yol/rapor.xlsx
```

## Teknik

Next.js 15 · TypeScript · Tailwind CSS · Recharts · SheetJS

Tüm hesaplama istemci tarafında. Kurallar (bölüşüm ayarları, özel oranlar,
birleştirmeler) `localStorage`'da saklanır.
