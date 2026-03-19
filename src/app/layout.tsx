import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RO Instance Tracker",
  description: "Gerencie suas instâncias de Ragnarok Online",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-[#0f0f17] text-gray-200 min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
