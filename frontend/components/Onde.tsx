/**
 * Onde sonore dessinee, avec les trois zones de niveau du produit.
 *
 * Ce n'est pas un ornement : elle montre d'emblee la regle qui decidera si
 * l'enregistrement de l'utilisateur est accepte. Les seuils dessines sont
 * ceux qu'applique reellement le backend (-18 dBFS et -1 dBFS).
 */
export function Onde({ className = "" }: { className?: string }) {
  // Trace deterministe : meme rendu au serveur et au client.
  const barres = Array.from({ length: 96 }, (_, i) => {
    const lent = Math.sin(i / 7.5);
    const rapide = Math.sin(i / 2.1) * 0.45;
    const grain = Math.sin(i * 12.9898) * 0.22;
    return Math.min(1, Math.abs(lent + rapide + grain) * 0.78 + 0.06);
  });

  return (
    <svg
      className={className}
      viewBox="0 0 384 96"
      preserveAspectRatio="none"
      role="img"
      aria-label="Onde sonore : en dessous du seuil le son est trop faible, au dessus il sature."
    >
      {barres.map((h, i) => {
        const hauteur = Math.max(2, h * 88);
        // La couleur suit le niveau, exactement comme le vumetre de l'app.
        const teinte = h > 0.88 ? "var(--brulure)" : h > 0.62 ? "var(--eclat)" : "var(--signal)";
        return (
          <rect
            key={i}
            x={i * 4}
            y={(96 - hauteur) / 2}
            width={2.4}
            height={hauteur}
            fill={teinte}
          />
        );
      })}
    </svg>
  );
}
