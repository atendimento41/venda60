import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-montserrat",
});
/** App usa banco em runtime — evita falha no "Generating static pages" da Vercel. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "60 Vendas - 60 Minutos",
  description: "Controle operacional de vendas · 60 Minutos Escape Game",
  icons: { icon: "/logo-60.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={montserrat.variable}>{children}</body>
    </html>
  );
}
