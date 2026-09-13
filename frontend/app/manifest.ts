import type { MetadataRoute } from "next";

// Permet d'ajouter la demonstration a l'ecran d'accueil d'un telephone,
// ou elle est testee.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Votre voix — clone vocal",
    short_name: "Votre voix",
    description:
      "Clonez votre voix en local et entraînez-vous à vos rendez-vous commerciaux.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f2ec",
    theme_color: "#3826f5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
