import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FitCoach',
  description: 'Dein persönlicher Fitness-Begleiter',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className="h-full">
      <body className="h-full bg-gray-50 antialiased">
        {children}
      </body>
    </html>
  )
}
