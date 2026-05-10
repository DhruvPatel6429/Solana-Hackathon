import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";
import { AppProviders } from "@/components/providers";
import { ToastViewport } from "@/components/toast-viewport";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Borderless Payroll Copilot",
  description: "USDC treasury and global contractor payroll on Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} min-h-screen bg-[#0A0A0F] font-sans text-zinc-100 antialiased`}>
        <AppProviders>
          {children}
          <ToastViewport />
        </AppProviders>
      </body>
    </html>
  );
}
