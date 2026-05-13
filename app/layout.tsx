import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audix — UX Audit Tool",
  description: "Evaluación heurística con IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-[#0F2156] text-white px-6 py-4 flex items-center gap-6">
          <span className="text-xl font-bold tracking-tight">Audix</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-[#6B9FD4] hover:text-white transition-colors">
              Inicio
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
