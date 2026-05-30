import withPWA from "next-pwa";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

const withPWAConfig = withPWA({
  dest: "public",
  disable: process.platform === "win32" || process.env.DISABLE_PWA === "true",
  register: true,
  skipWaiting: true,
});

// Parse NEXT_PUBLIC_BACKEND_URL into a remotePattern so Next.js <Image>
// can load checkin photos from the production backend.
function backendImagePattern(): RemotePattern | null {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
  } catch {
    return null;
  }
}

const prodPattern = backendImagePattern();

const nextConfig = withPWAConfig({
  experimental: {
    workerThreads: true,
  },
  serverExternalPackages: ["pdf-parse"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "4000" },
      ...(prodPattern ? [prodPattern] : []),
    ],
  },
});

export default nextConfig;
