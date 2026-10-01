"use client";

import localFont from "next/font/local";

import { ErrorState } from "@/components/ui/error-state";
import "./globals.css";

const inter = localFont({ src: "./fonts/InterVariable.woff2", weight: "100 900", display: "swap", variable: "--font-inter" });

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body className={inter.variable}><ErrorState code={500} onRetry={retry} /></body></html>;
}
