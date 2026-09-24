"use client";

import { Archivo } from "next/font/google";

import { ErrorState } from "@/components/ui/error-state";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], display: "swap", variable: "--font-archivo" });

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body className={archivo.variable}><ErrorState code={500} onRetry={retry} /></body></html>;
}
