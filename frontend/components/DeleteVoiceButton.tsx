"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteProfile, listProfiles, type VoiceProfile } from "@/lib/api";

/**
 * Materialise la promesse de confidentialite : mono-profil (comme le reste
 * de l'application, voir brief/page.tsx qui prend toujours profils[0]), donc
 * un seul bouton suffit. N'affiche rien tant qu'aucune voix n'existe.
 */
export function DeleteVoiceButton() {
  const [profil, setProfil] = useState<VoiceProfile | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    async function charger() {
      try {
        const profils = await listProfiles();
        if (!annule) setProfil(profils[0] ?? null);
      } catch (e) {
        if (!annule) {
          setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
        }
      }
    }
    void charger();
    return () => {
      annule = true;
    };
  }, []);

  async function supprimer() {
    if (!profil) return;
    const confirme = window.confirm(
      "Supprimer votre voix clonée et l'échantillon audio associé ? Cette action est irréversible."
    );
    if (!confirme) return;
    setOccupe(true);
    setErreur(null);
    try {
      await deleteProfile(profil.id);
      setProfil(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setOccupe(false);
    }
  }

  // Ni voix clonee, ni erreur a signaler : rien a afficher.
  if (!profil && !erreur) return null;

  return (
    <div className="space-y-2">
      {profil && (
        <Button variant="secondary" size="sm" onClick={supprimer} disabled={occupe}>
          {occupe ? "Suppression..." : "Supprimer ma voix"}
        </Button>
      )}
      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {erreur}
        </div>
      )}
    </div>
  );
}
