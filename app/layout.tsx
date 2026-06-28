import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MilaCoach",
  description: "Fitness Coaching App",
  applicationName: "MilaCoach",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  // Lets iOS Safari launch the home-screen entry standalone (no browser chrome).
  appleWebApp: {
    capable: true,
    title: "MilaCoach",
    statusBarStyle: "black-translucent",
  },
};

// viewportFit: 'cover' lets the page draw under the notch/status bar so the
// env(safe-area-inset-*) values become non-zero; themeColor tints the system UI.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050504",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="h-full antialiased" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
