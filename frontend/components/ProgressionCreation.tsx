"use client";
import { avancement, formaterDuree } from "@/lib/progression";

export type PhaseCreation = "profil" | "extrait";

const LIBELLE: Record<PhaseCreation, string> = {
  profil: "Enregistrement de votre échantillon…",
  extrait: "Votre voix prononce une première phrase…",
};

/**
 * La creation de la voix dure de quelques dizaines de secondes a plusieurs
 * minutes (premier chargement du modele, synthese sur processeur) : sans
 * retour visuel, l'utilisateur croit l'application figee.
 */
export function ProgressionCreation({
  phase,
  ecouleS,
  estimationS,
  premierChargement,
}: {
  phase: PhaseCreation;
  ecouleS: number;
  estimationS: number;
  premierChargement: boolean;
}) {
  const pourcentage = avancement(ecouleS, estimationS);
  const restantS = estimationS - ecouleS;

  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="text-base font-semibold">{LIBELLE[phase]}</p>
      <div
        className="progression"
        role="progressbar"
        aria-label="Création de votre voix"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pourcentage)}
      >
        <div className="progression-jauge" style={{ transform: `scaleX(${pourcentage / 100})` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[0.95rem] font-medium">
        <span className="tabular-nums">{formaterDuree(ecouleS)} écoulées</span>
        <span className="tabular-nums text-[var(--estompe)]">
          {restantS > 0
            ? `Environ ${formaterDuree(restantS)} restantes`
            : "Presque terminé, merci de patienter…"}
        </span>
      </div>
      {premierChargement && (
        <p className="text-[0.95rem] text-[var(--estompe)]">
          Premier lancement : le modèle vocal se charge en mémoire. Cela ne se
          produit qu&apos;une fois, les prochaines créations seront plus rapides.
        </p>
      )}
    </div>
  );
}
