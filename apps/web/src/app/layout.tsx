import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntentFlow — AI-Native Commerce Orchestration",
  description:
    "AI proposes. Policy decides. Razorpay executes. IntentFlow brings autonomous, policy-governed commerce to the agentic era.",
  keywords: ["AI commerce", "agentic", "Razorpay", "intent-driven", "payments"],
  authors: [{ name: "IntentFlow Team" }],
  openGraph: {
    title: "IntentFlow",
    description: "AI-Native Commerce Orchestration",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
