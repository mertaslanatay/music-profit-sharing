/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Mali veri içeren bir uygulama — temel tarayıcı-taraflı sertleştirme.
        // Yetkilendirmenin kendisi zaten sunucu tarafında (bkz. guard.ts); bunlar
        // ek bir katman (clickjacking, MIME sniffing, üçüncü taraf gömme).
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
