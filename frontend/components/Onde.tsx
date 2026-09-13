"use client";
import { useEffect, useRef } from "react";

const NB_BARRES = 96;
const PAS = 4; // espacement des barres, en unites du viewBox
const HAUTEUR = 96;
const VITESSE = 8; // unites du viewBox par seconde : une barre toutes les demi-secondes

// Frequences entieres sur 96 barres : le motif est periodique, la boucle de
// defilement ne laisse voir aucun raccord.
const MOTIF = Array.from({ length: NB_BARRES }, (_, i) => {
  const lent = Math.sin((4 * Math.PI * i) / NB_BARRES);
  const rapide = Math.sin((14 * Math.PI * i) / NB_BARRES) * 0.45;
  const grain = Math.sin(i * 12.9898) * 0.22;
  return Math.min(1, Math.abs(lent + rapide + grain) * 0.78 + 0.06);
});

// Chaque barre a sa propre phase, pour que l'onde ne respire pas d'un bloc.
const DEPHASAGE = MOTIF.map((_, i) => Math.sin(i * 78.233) * Math.PI);

// Toute l'onde gonfle et se retracte en 4,5 s ; chaque barre y ajoute un
// frisson plus rapide.
function niveau(indice: number, t: number) {
  const souffle = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 4.5);
  const frisson = 0.12 * Math.sin((2 * Math.PI * t) / 1.9 + DEPHASAGE[indice]);
  return Math.min(1, Math.max(0, MOTIF[indice] * (souffle + frisson)));
}

// La barre j montre le motif decale de `decalage` barres vers la droite. La
// barre 0 attend hors cadre, a gauche, et entre pendant le defilement.
const indiceMotif = (j: number, decalage: number) =>
  (((j - 1 - decalage) % NB_BARRES) + NB_BARRES) % NB_BARRES;

// La couleur suit le niveau, exactement comme le vumetre de l'app.
const teinte = (h: number) =>
  h > 0.88 ? "var(--brulure)" : h > 0.62 ? "var(--eclat)" : "var(--signal)";

// Centree verticalement : la barre grandit vers le haut et vers le bas.
const geometrie = (h: number) => {
  const hauteur = Math.max(2, h * 88);
  return { y: (HAUTEUR - hauteur) / 2, hauteur };
};

// Math.sin peut differer au dernier bit d'un moteur JS a l'autre : arrondir
// garde le meme rendu au serveur et au client.
const arrondi = (v: number) => Math.round(v * 100) / 100;

/**
 * Onde sonore dessinee, avec les trois zones de niveau du produit.
 *
 * Ce n'est pas un ornement : elle montre d'emblee la regle qui decidera si
 * l'enregistrement de l'utilisateur est accepte. Les seuils dessines sont
 * ceux qu'applique reellement le backend (-18 dBFS et -1 dBFS).
 *
 * Elle defile lentement vers la droite et respire, comme une voix captee en
 * direct : en gonflant, les barres passent du bleu au jaune puis au rouge.
 */
export function Onde({ className = "" }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const cadre = svg.current;
    const groupe = cadre?.firstElementChild as SVGGElement | null;
    if (!cadre || !groupe) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const barres = Array.from(groupe.children) as SVGRectElement[];

    // Inutile de calculer une onde que personne ne voit.
    let visible = true;
    const observateur = new IntersectionObserver(([entree]) => {
      visible = entree.isIntersecting;
    });
    observateur.observe(cadre);

    let frame = 0;
    const debut = performance.now();
    const boucle = (maintenant: number) => {
      frame = requestAnimationFrame(boucle);
      if (!visible) return;
      const t = (maintenant - debut) / 1000;
      const parcours = t * VITESSE;
      const decalage = Math.floor(parcours / PAS);
      groupe.setAttribute("transform", `translate(${parcours - decalage * PAS} 0)`);
      barres.forEach((barre, j) => {
        const h = niveau(indiceMotif(j, decalage), t);
        const { y, hauteur } = geometrie(h);
        barre.setAttribute("y", String(y));
        barre.setAttribute("height", String(hauteur));
        barre.style.fill = teinte(h);
      });
    };
    frame = requestAnimationFrame(boucle);
    return () => {
      cancelAnimationFrame(frame);
      observateur.disconnect();
    };
  }, []);

  return (
    <svg
      ref={svg}
      className={className}
      viewBox={`0 0 ${NB_BARRES * PAS} ${HAUTEUR}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Onde sonore : en dessous du seuil le son est trop faible, au dessus il sature."
    >
      <g>
        {Array.from({ length: NB_BARRES + 1 }, (_, j) => {
          const h = niveau(indiceMotif(j, 0), 0);
          const { y, hauteur } = geometrie(h);
          return (
            <rect
              key={j}
              x={(j - 1) * PAS}
              y={arrondi(y)}
              width={2.4}
              height={arrondi(hauteur)}
              style={{ fill: teinte(h) }}
            />
          );
        })}
      </g>
    </svg>
  );
}
