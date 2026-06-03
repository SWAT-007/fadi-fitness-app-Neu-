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
  // Keep the dev file-watcher from recompiling/full-reloading on generated
  // artifacts (Playwright screenshots/logs, graphify output). Writing these into
  // the project root otherwise triggers an endless Fast-Refresh → GET /client loop.
  webpack: (
    config: import("webpack").Configuration,
    { dev }: { dev: boolean },
  ) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/.playwright-mcp/**",
          "**/review-*.png",
          "**/graphify-out/**",
          "**/uploads/**",
        ],
      };
    }
    return config;
  },
});

export default nextConfig;
