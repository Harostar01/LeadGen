import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadPulse AI - Social Listening & Lead Intent CRM",
  description: "Full-stack zero-cost lead scoring app using Groq Llama-3.1-8b-instant, Supabase PostgreSQL, Upstash Redis, and Chrome Extension.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080c14] text-slate-100 min-h-screen selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
