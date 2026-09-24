import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Nognog Operations | Construction ERP",
  description:
    "Nognog Enterprises designs and builds houses for private clients and delivers public works across the Philippines. PCAB Category A contractor based in Cebu.",
  metadataBase: new URL("https://www.nognogenterprises.com"),
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${inter.variable} min-h-screen bg-white text-neutral-900 antialiased selection:bg-cyan-200 selection:text-[#061228]`}>
        {children}
      </body>
    </html>
  );
}
