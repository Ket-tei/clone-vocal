// Reglage du micro avant l'enregistrement de reference.

/**
 * Par defaut, le navigateur applique gain automatique, reduction de bruit et
 * annulation d'echo. Pour un clone vocal, c'est doublement nuisible : le gain
 * ramene une voix douce et un cri au meme niveau (le vumetre ne reagit plus
 * et le son part ecrete au backend), et la reduction de bruit abime le timbre
 * a cloner. La session de questions, elle, garde ces traitements : la,
 * l'annulation d'echo empeche le micro de capter la voix clonee.
 */
export const CONTRAINTES_ENREGISTREMENT: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

// Seuils de crete du controle qualite (backend/app/audio/validation.py :
// PEAK_MIN_DBFS et PEAK_MAX_DBFS). Le vumetre et le rapport de qualite les
// partagent, pour ne jamais se contredire.
export const SEUIL_TROP_FAIBLE_DBFS = -30;
export const SEUIL_SATURE_DBFS = -1;

// Bas de l'echelle du vumetre : en dessous, la jauge est vide.
export const PLANCHER_JAUGE_DBFS = -60;

export type ZoneNiveau = "faible" | "correct" | "sature";

/** Meme jugement que le backend : trop faible sous le seuil bas, sature au-dessus du haut. */
export function zoneNiveau(dbfs: number): ZoneNiveau {
  if (dbfs < SEUIL_TROP_FAIBLE_DBFS) return "faible";
  return dbfs > SEUIL_SATURE_DBFS ? "sature" : "correct";
}

const TIERS = 100 / 3;
const fraction = (v: number, bas: number, haut: number) =>
  Math.min(1, Math.max(0, (v - bas) / (haut - bas)));

/**
 * Position sur la jauge, de 0 a 100. Trois zones de largeur egale, la bonne
 * plage au centre : l'echelle n'est lineaire en dB qu'a l'interieur de chaque
 * zone. Une echelle lineaire de -60 a 0 dBFS reduisait la zone saturee a un
 * trait et rejetait la bonne plage sur le bord.
 */
export function positionJauge(dbfs: number): number {
  if (dbfs < SEUIL_TROP_FAIBLE_DBFS) {
    return fraction(dbfs, PLANCHER_JAUGE_DBFS, SEUIL_TROP_FAIBLE_DBFS) * TIERS;
  }
  if (dbfs <= SEUIL_SATURE_DBFS) {
    return TIERS + fraction(dbfs, SEUIL_TROP_FAIBLE_DBFS, SEUIL_SATURE_DBFS) * TIERS;
  }
  return 2 * TIERS + fraction(dbfs, SEUIL_SATURE_DBFS, 0) * TIERS;
}

// Vitesse de retombee de l'affichage, dans l'esprit d'un crete-metre de studio.
const RELACHE_DB_PAR_S = 20;

/** Crete du tampon en dBFS : la mesure qu'applique le controle qualite du backend. */
export function niveauCrete(tampon: Float32Array): number {
  let crete = 0;
  for (const v of tampon) crete = Math.max(crete, Math.abs(v));
  return 20 * Math.log10(Math.max(crete, 1e-10));
}

/**
 * Attaque instantanee, retombee progressive. Sans elle, l'affichage tombe au
 * plancher entre deux syllabes et la barre clignote au lieu de se lire.
 */
export function relacher(affiche: number, mesure: number, dtS: number): number {
  return Math.max(mesure, affiche - RELACHE_DB_PAR_S * dtS);
}
