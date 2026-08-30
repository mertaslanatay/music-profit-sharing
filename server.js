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
const next = require("next");

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
