"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MicLevelMeter } from "@/components/MicLevelMeter";
import { QualityReport } from "@/components/QualityReport";
import { Button } from "@/components/ui/button";
import { analyzeSample, createProfile, previewVoice, type AnalyzeResult } from "@/lib/api";
import { SCRIPT_LECTURE, webmToWav } from "@/lib/audio";

type Etape = "micro" | "lecture" | "controle" | "validation";

export default function Onboarding() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("micro");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [erreurMicro, setErreurMicro] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState<Blob | null>(null);
  const [resultat, setResultat] = useState<AnalyzeResult | null>(null);
  const [occupe, setOccupe] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);

  async function autoriserMicro() {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ audio: true }));
      setErreurMicro(null);
    } catch {
      setErreurMicro(
        "Micro refusé ou introuvable. Autorisez l'accès au micro dans la barre " +
          "d'adresse de votre navigateur, puis rechargez cette page."
      );
    }
  }

  function demarrer() {
    if (!stream) return;
    morceaux.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => morceaux.current.push(e.data);
    mr.onstop = async () => {
      setOccupe(true);
      // Obligatoire : soundfile ne lit pas le WebM produit par MediaRecorder.
      const wav = await webmToWav(new Blob(morceaux.current, { type: "audio/webm" }));
      setEnregistre(wav);
      setResultat(await analyzeSample(new File([wav], "e.wav", { type: "audio/wav" })));
      setOccupe(false);
      setEtape("controle");
    };
    recorder.current = mr;
    mr.start();
    setEtape("lecture");
  }

  async function enregistrerProfil() {
    if (!enregistre) return;
    setOccupe(true);
    const profil = await createProfile(
      new File([enregistre], "e.wav", { type: "audio/wav" }), "Ma voix"
    );
    const audio = await previewVoice(
      profil.id,
      "Bonjour, je suis ravi d'échanger avec vous aujourd'hui sur votre projet."
    );
    new Audio(URL.createObjectURL(audio)).play();
    setOccupe(false);
    setEtape("validation");
    setTimeout(() => router.push("/brief"), 6000);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <h1 className="text-3xl font-semibold">Cloner votre voix</h1>

      {etape === "micro" && (
        <section className="space-y-4">
          <p className="text-muted-foreground">
            Commençons par vérifier votre micro. Parlez normalement : le niveau doit
            rester dans la zone verte.
          </p>
          {!stream && <Button onClick={autoriserMicro}>Autoriser le micro</Button>}
          {erreurMicro && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              {erreurMicro}
            </div>
          )}
          {stream && (
            <>
              <MicLevelMeter stream={stream} />
              <Button onClick={demarrer}>Commencer l&apos;enregistrement</Button>
            </>
          )}
        </section>
      )}

      {etape === "lecture" && (
        <section className="space-y-4">
          <p className="text-muted-foreground">
            Lisez ce texte à voix haute, à votre rythme habituel.
          </p>
          <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-6 text-xl leading-relaxed">
            {SCRIPT_LECTURE}
          </p>
          <Button onClick={() => recorder.current?.stop()} variant="secondary">
            J&apos;ai terminé
          </Button>
        </section>
      )}

      {etape === "controle" && resultat && (
        <section className="space-y-4">
          <QualityReport resultat={resultat} />
          {resultat.ok ? (
            <Button onClick={enregistrerProfil} disabled={occupe}>
              {occupe ? "Création de votre voix..." : "Créer ma voix"}
            </Button>
          ) : (
            <Button onClick={() => setEtape("micro")} variant="secondary">
              Recommencer
            </Button>
          )}
        </section>
      )}

      {etape === "validation" && (
        <section className="space-y-4">
          <p className="text-lg">
            Écoutez : voici votre voix prononçant une phrase que vous n&apos;avez pas
            enregistrée.
          </p>
          <p className="text-muted-foreground">
            Si le résultat ne vous convainc pas, refaites l&apos;enregistrement dans un
            endroit plus calme.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push("/brief")}>Cela me convient</Button>
            <Button variant="secondary" onClick={() => setEtape("micro")}>
              Recommencer
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
