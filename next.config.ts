import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

// PWA service worker is the hand-written public/sw.js (registered in app/layout.tsx).
// No next-pwa/Workbox generation — keeps /sw.js predictable and online-first so
// production deploys (and the Capacitor WebView) never serve stale cached content.

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

const nextConfig: NextConfig = {
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
  // Params are contextually typed by NextConfig['webpack'] — no need to import the
  // webpack module's types directly (it is bundled inside Next).
  webpack: (config, { dev }) => {
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
};

export default nextConfig;
