"use client";
import { useEffect, useState } from "react";
import { deleteProfile, listProfiles, type VoiceProfile } from "@/lib/api";

function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : "Erreur inconnue.";
}

/**
 * Materialise la promesse de confidentialite : efface TOUS les profils vocaux
 * et leurs echantillons, pas seulement le premier. Rien ne garantit qu'il n'y
 * en ait qu'un : un onboarding recommence, une session precedente, un profil
 * cree a la main en laissent plusieurs sur le disque. Un bouton qui n'en
 * supprime qu'un laisserait l'utilisateur croire que tout est efface.
 *
 * N'affiche rien tant qu'aucune voix n'existe.
 */
export function DeleteVoiceButton() {
  const [profils, setProfils] = useState<VoiceProfile[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    async function charger() {
      try {
        const liste = await listProfiles();
        if (!annule) setProfils(liste);
      } catch (e) {
        if (!annule) setErreur(messageErreur(e));
      }
    }
    void charger();
    return () => {
      annule = true;
    };
  }, []);

  async function supprimer() {
    if (profils.length === 0) return;
    const quoi =
      profils.length > 1
        ? `vos ${profils.length} voix clonées et les échantillons audio associés`
        : "votre voix clonée et l'échantillon audio associé";
    if (!window.confirm(`Supprimer ${quoi} ? Cette action est irréversible.`)) return;

    setOccupe(true);
    setErreur(null);
    // Suppression une par une, sans abandonner au premier echec : chaque
    // echantillon efface est un echantillon biometrique de moins sur le
    // disque, meme si l'un d'eux resiste.
    const echecs: string[] = [];
    for (const profil of profils) {
      try {
        await deleteProfile(profil.id);
      } catch (e) {
        echecs.push(`« ${profil.label} » : ${messageErreur(e)}`);
      }
    }

    // Rechargement systematique : c'est la liste du serveur qui fait foi, pas
    // ce que l'on croit avoir supprime. Sans lui, l'interface affirmerait que
    // tout est efface sans l'avoir verifie.
    try {
      setProfils(await listProfiles());
    } catch (e) {
      echecs.push(`Impossible de vérifier la liste des voix : ${messageErreur(e)}`);
    }

    setErreur(
      echecs.length > 0
        ? `Suppression incomplète, votre voix est peut-être toujours sur le disque. ${echecs.join(" ")}`
        : null
    );
    setOccupe(false);
  }

  // Ni voix clonee, ni erreur a signaler : rien a afficher.
  if (profils.length === 0 && !erreur) return null;

  // Lien discret sous l'action principale : la suppression doit rester
  // accessible sans concurrencer « Me cloner ».
  return (
    <div className="space-y-2">
      {profils.length > 0 && (
        <>
          <button
            type="button"
            onClick={supprimer}
            disabled={occupe}
            className="text-sm font-semibold text-[var(--estompe)] underline decoration-[var(--trait)] underline-offset-4 transition-colors hover:text-[var(--encre)] hover:decoration-current disabled:opacity-50"
          >
            {occupe
              ? "Suppression..."
              : profils.length > 1
                ? `Supprimer mes ${profils.length} voix`
                : "Supprimer ma voix"}
          </button>
          {profils.length > 1 && (
            <p className="text-xs text-[var(--estompe)]">
              {profils.length} échantillons de votre voix sont enregistrés.
            </p>
          )}
        </>
      )}
      {erreur && <div className="avis avis-erreur text-sm">{erreur}</div>}
    </div>
  );
}
