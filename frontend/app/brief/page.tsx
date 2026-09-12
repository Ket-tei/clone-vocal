"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BriefForm } from "@/components/BriefForm";
import { generateScript, listProfiles, type Brief } from "@/lib/api";

export default function PageBrief() {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre(brief: Brief) {
    setOccupe(true);
    setErreur(null);
    try {
      const profils = await listProfiles();
      if (profils.length === 0) {
        router.push("/onboarding");
        return;
      }
      const script = await generateScript(brief);
      sessionStorage.setItem(
        "session",
        JSON.stringify({ brief, script, profilId: profils[0].id })
      );
      router.push("/session");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="enveloppe flex flex-1 flex-col gap-8 py-12">
        <div className="space-y-4">
          <h1 className="titre">Votre prochain rendez-vous</h1>
          <p className="sous-titre">
            Décrivez le prospect. Ces informations restent sur votre machine.
          </p>
        </div>

        {erreur && <div className="avis avis-erreur">{erreur}</div>}

        <BriefForm onSubmit={soumettre} occupe={occupe} />
      </div>
    </main>
  );
}
