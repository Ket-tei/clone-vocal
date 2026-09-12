import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sortie autonome : le build produit un serveur Node minimal, sans avoir
  // besoin de node_modules sur la machine cible. Indispensable ici, le VPS
  // de demonstration n'a qu'un vCPU et environ 1 Go de RAM libre : y lancer
  // "npm install" puis "next build" mettrait en peril les services voisins.
  output: "standalone",
};

export default nextConfig;
