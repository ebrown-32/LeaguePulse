import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  // Optimize for modern displays
  adjustFontFallback: true,
  preload: true,
});

export const metadata: Metadata = {
  title: "League Pulse",
  description: "Your Fantasy Football League, Visualized",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} font-sans`}>
      <body className="min-h-screen bg-gray-900 text-white antialiased">
        <Navbar />
        <main className="container mx-auto px-4 py-6 md:px-8 lg:px-12 md:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
