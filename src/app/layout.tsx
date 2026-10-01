import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

// Bundled so builds and dev never depend on reaching Google Fonts (a failed
// download silently switched the whole app to a heavier fallback font).
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Nognog Operations | Construction ERP",
  description:
    "Nognog designs and builds houses for private clients and delivers public works across the Philippines. PCAB Category A contractor based in Cebu.",
  metadataBase: new URL("https://www.nognogenterprises.com"),
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><Script id="nognog-theme" strategy="beforeInteractive">{'try{const theme=localStorage.getItem("nognog.theme");if(theme==="blue"||theme==="dark")document.documentElement.dataset.theme=theme}catch{}'}</Script></head>
      <body className={`${inter.className} ${inter.variable} min-h-screen bg-white text-neutral-900 antialiased selection:bg-cyan-200 selection:text-[#061228]`}>
        {children}
      </body>
    </html>
  );
}
