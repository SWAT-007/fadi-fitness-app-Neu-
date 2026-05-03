import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MilaCoach",
  description: "Fitness Coaching App",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="h-full bg-gray-50 antialiased">
        {children}
      </body>
    </html>
  );
}