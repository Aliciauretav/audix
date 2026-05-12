import type { Metadata } from "next";
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
        <header className="bg-[#0F2156] text-white px-6 py-4 flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">Audix</span>
          <span className="text-[#6B9FD4] text-sm hidden sm:inline">
            UX Audit Tool con IA
          </span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
