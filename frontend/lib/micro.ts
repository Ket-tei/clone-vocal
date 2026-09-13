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
