import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientLayout from "./client-layout";

export const metadata: Metadata = {
  title: "UTXOS SDK Test Interface",
  description: "Test blockchain interactions and wallet connections",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
