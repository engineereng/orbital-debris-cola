import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Cape COLA — Nova-class screening demo",
  description:
    "Portfolio COLA screening demo: Cape Canaveral window scrub against a pinned LEO catalog. Not ops COLA or TraCSS.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
