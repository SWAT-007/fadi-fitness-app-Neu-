import withPWA from "next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  disable: process.platform === "win32" || process.env.DISABLE_PWA === "true",
  register: true,
  skipWaiting: true,
});

const nextConfig = withPWAConfig({
  experimental: {
    workerThreads: true,
  },
  serverExternalPackages: ["pdf-parse"],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'omyahzgbzmvovrmeuxlv.supabase.co' },
    ],
  },
});

export default nextConfig;
