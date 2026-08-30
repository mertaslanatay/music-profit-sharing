/**
 * cPanel / Phusion Passenger için özel başlatma dosyası.
 *
 * Passenger, "Setup Node.js App" ile oluşturulan uygulamayı çalıştırırken
 * kendi PORT numarasını process.env.PORT üzerinden verir ve uygulamanın
 * bu porttan bir HTTP sunucusu açmasını bekler. Next.js'in normal
 * "next start" komutu bunu Passenger'ın istediği şekilde yapmadığı için
 * (ve Passenger doğrudan bir .js dosyası çalıştırmak istediği için)
 * burada Next.js'i elle bir http.Server içine sarıyoruz.
 */
const http = require("http");
const dns = require("dns");
const net = require("net");
const next = require("next");

// Bazı paylaşımlı hostinglerde IPv4 açık ama IPv6 kapalı oluyor. Node 20+
// bir adres hem IPv4 hem IPv6'ya çözüldüğünde ikisini de otomatik deniyor
// ("happy eyeballs") ve IPv6 denemesi engellenince tüm bağlantı "hepsi
// başarısız oldu" diye BOŞ MESAJLI bir hata atıyor (pg / fetch dahil).
// IPv4'ü öne alıp çift-yığın otomatik denemesini kapatarak bu belirsiz
// hatayı ortadan kaldırıyoruz.
dns.setDefaultResultOrder("ipv4first");
try {
  net.setDefaultAutoSelectFamily(false);
} catch {
  // Bu Node sürümünde yoksa sorun değil — yukarıdaki sıralama tek başına
  // da çoğu durumda yeterli.
}

const port = parseInt(process.env.PORT, 10) || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      handle(req, res);
    });

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`> M4NM sunucusu ${port} portunda çalışıyor (production)`);
    });
  })
  .catch((err) => {
    console.error("Next.js başlatılamadı:", err);
    process.exit(1);
  });

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
