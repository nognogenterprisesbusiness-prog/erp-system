import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nognog Enterprises | Design-Build Houses & Public Works, Cebu",
  description:
    "Nognog Enterprises designs and builds houses for private clients and delivers public works across the Philippines. PCAB Category A contractor based in Cebu.",
  metadataBase: new URL("https://www.nognogenterprises.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased selection:bg-neutral-900 selection:text-white">
        {children}
      </body>
    </html>
  );
}
