import type { Metadata, Viewport } from "next";
import { Overpass } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const overpass = Overpass({ subsets: ["latin"], weight: ["400", "600", "800"] });
const school = process.env.NEXT_PUBLIC_SCHOOL_NAME || "Drivers Ed";

export const metadata: Metadata = {
  title: `${school} Scheduler`,
  description: "Sign up for drivers ed and pick your driving group.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: `${school} Scheduler` },
};

export const viewport: Viewport = { themeColor: "#22252a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={overpass.className}>
        <header className="top">
          <Link href="/" className="brand">
            <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
              <rect x="5" y="5" width="24" height="24" rx="3" transform="rotate(45 17 17)" fill="#f5c400" stroke="#17181a" strokeWidth="2" />
              <circle cx="17" cy="17" r="6.5" fill="none" stroke="#17181a" strokeWidth="2.2" />
              <path d="M10.5 17h13M17 17v6.5" stroke="#17181a" strokeWidth="2.2" />
            </svg>
            {school} Scheduler
          </Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
