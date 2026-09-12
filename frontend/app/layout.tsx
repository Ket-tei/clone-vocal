import type { Metadata } from "next";
import { Archivo, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// Bricolage porte le titrage : une grotesque variable au dessin affirme,
// qui tient le grand corps sans ressembler a la police par defaut de tout
// le monde. Archivo fait le reste, avec des chiffres tabulaires pour les
// dBFS et les secondes.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Votre voix — clone vocal",
  description:
    "Clonez votre voix en local et entraînez-vous à vos rendez-vous commerciaux.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${bricolage.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
