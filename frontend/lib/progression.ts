// Estimation de la duree de creation de la voix : enregistrement du profil
// puis premiere synthese, de loin l'etape la plus longue.

/** Le modele vocal n'est pas encore en memoire : chargement puis synthese. */
export const DUREE_PREMIER_CHARGEMENT_S = 180;
/** Premiere synthese sans mesure precedente sur cette machine. */
export const DUREE_PAR_DEFAUT_S = 60;

const CLE_DUREES = "clone-vocal:durees-creation";
const MESURES_GARDEES = 5;

/**
 * Duree attendue, en secondes. La mediane des dernieres creations absorbe une
 * mesure aberrante (machine occupee) sans fausser l'estimation suivante.
 */
export function estimerDureeS(modeleCharge: boolean, mesures: number[]): number {
  if (!modeleCharge) return DUREE_PREMIER_CHARGEMENT_S;
  if (mesures.length === 0) return DUREE_PAR_DEFAUT_S;
  const triees = [...mesures].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 ? triees[milieu] : (triees[milieu - 1] + triees[milieu]) / 2;
}

/**
 * Avancement affiche, de 0 a 100 : lineaire jusqu'a 90 % a la duree estimee,
 * puis de plus en plus lent. La barre n'atteint jamais 100 % d'elle-meme :
 * seule la reponse du serveur termine l'operation.
 */
export function avancement(ecouleS: number, estimationS: number): number {
  if (ecouleS <= 0 || estimationS <= 0) return 0;
  const ratio = ecouleS / estimationS;
  if (ratio <= 1) return 90 * ratio;
  return 90 + 8 * (1 - Math.exp(-(ratio - 1)));
}

export function formaterDuree(secondes: number): string {
  const total = Math.max(0, Math.round(secondes));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const reste = total % 60;
  return reste ? `${minutes} min ${reste} s` : `${minutes} min`;
}

// Stockage local : une simple commodite d'affichage. Navigation privee ou
// stockage bloque, on repart de l'estimation par defaut sans rien casser.
export function lireDurees(): number[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_DUREES) ?? "[]");
    return Array.isArray(brut) ? brut.filter((d): d is number => typeof d === "number" && d > 0) : [];
  } catch {
    return [];
  }
}

export function memoriserDuree(secondes: number): void {
  try {
    const durees = [...lireDurees(), secondes].slice(-MESURES_GARDEES);
    localStorage.setItem(CLE_DUREES, JSON.stringify(durees));
  } catch {
    // Sans stockage, la prochaine estimation reprendra la valeur par defaut.
  }
}
