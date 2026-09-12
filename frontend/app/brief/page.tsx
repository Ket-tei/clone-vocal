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
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-3xl font-semibold">Votre prochain rendez-vous</h1>
      <p className="text-muted-foreground">
        Décrivez le prospect. Ces informations restent sur votre machine.
      </p>
      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {erreur}
        </div>
      )}
      <BriefForm onSubmit={soumettre} occupe={occupe} />
    </main>
  );
}
