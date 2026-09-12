"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicLevelMeter } from "@/components/MicLevelMeter";
import { QualityReport } from "@/components/QualityReport";
import { Button } from "@/components/ui/button";
import {
  analyzeSample,
  createProfile,
  deleteProfile,
  previewVoice,
  type AnalyzeResult,
} from "@/lib/api";
import { SCRIPT_LECTURE, webmToWav } from "@/lib/audio";

type Etape = "micro" | "lecture" | "controle" | "validation";

function messageErreur(e: unknown, repli: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return repli;
}

export default function Onboarding() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("micro");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [erreurMicro, setErreurMicro] = useState<string | null>(null);
  const [erreurTraitement, setErreurTraitement] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState<Blob | null>(null);
  const [resultat, setResultat] = useState<AnalyzeResult | null>(null);
  const [occupe, setOccupe] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const webmBrut = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Identifiant du profil deja cree lors d'une tentative precedente. Sans lui,
  // "Recommencer" laisserait un echantillon de la voix sur le disque a chaque
  // passage : deux enregistrements = deux WAV biometriques conserves.
  const profilCree = useRef<string | null>(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Filet de securite : si l'utilisateur quitte la page en cours de route,
  // le micro ne doit pas rester allume indefiniment.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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

  function arreterMicro() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  /**
   * Repart de zero en effacant d'abord le profil deja cree. En cas d'echec on
   * reste sur place avec un message : redemarrer en silence laisserait
   * l'utilisateur croire que son ancien enregistrement a disparu.
   */
  async function recommencer() {
    setErreurTraitement(null);
    const ancien = profilCree.current;
    if (ancien) {
      setOccupe(true);
      try {
        await deleteProfile(ancien);
        profilCree.current = null;
      } catch (e) {
        setErreurTraitement(
          messageErreur(
            e,
            "Impossible de supprimer l'enregistrement précédent."
          ) + " Votre ancienne voix est peut-être toujours sur le disque ; réessayez."
        );
        return;
      } finally {
        setOccupe(false);
      }
    }
    setEnregistre(null);
    setResultat(null);
    setEtape("micro");
  }

  function demarrer() {
    if (!stream) return;
    morceaux.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => morceaux.current.push(e.data);
    mr.onstop = () => {
      // Le flux n'est plus necessaire une fois l'enregistrement capture : on
      // coupe le micro tout de suite, avant meme de savoir si le traitement
      // reussira. Un micro qui reste ouvert n'a rien a faire ici.
      arreterMicro();
      webmBrut.current = new Blob(morceaux.current, { type: "audio/webm" });
      void traiter(webmBrut.current);
    };
    recorder.current = mr;
    mr.start();
    setEtape("lecture");
  }

  async function traiter(webm: Blob) {
    setOccupe(true);
    setErreurTraitement(null);
    try {
      // Obligatoire : soundfile ne lit pas le WebM produit par MediaRecorder.
      const wav = await webmToWav(webm);
      setEnregistre(wav);
      const analyse = await analyzeSample(new File([wav], "e.wav", { type: "audio/wav" }));
      setResultat(analyse);
      setEtape("controle");
    } catch (e) {
      // Sans ce filet, une erreur ici (backend eteint, WebM illisible...)
      // laisserait l'utilisateur fige sur "occupe", sans message ni recours.
      setErreurTraitement(
        messageErreur(e, "Erreur inattendue lors de l'analyse de l'enregistrement.")
      );
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrerProfil() {
    if (!enregistre) return;
    setOccupe(true);
    setErreurTraitement(null);
    try {
      const profil = await createProfile(
        new File([enregistre], "e.wav", { type: "audio/wav" }), "Ma voix"
      );
      profilCree.current = profil.id;
      const audioBlob = await previewVoice(
        profil.id,
        "Bonjour, je suis ravi d'échanger avec vous aujourd'hui sur votre projet."
      );
      const url = URL.createObjectURL(audioBlob);
      const lecteur = new Audio(url);
      lecteur.onended = () => URL.revokeObjectURL(url);
      void lecteur.play();
      setEtape("validation");
    } catch (e) {
      // Meme filet qu'au-dessus : l'echantillon deja analyse (`enregistre`)
      // n'est pas perdu, l'utilisateur peut reessayer sans tout refaire.
      setErreurTraitement(
        messageErreur(e, "Erreur inattendue lors de la création de votre voix.")
      );
    } finally {
      setOccupe(false);
    }
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
          {!erreurTraitement && (
            <>
              <p className="text-muted-foreground">
                Lisez ce texte à voix haute, à votre rythme habituel.
              </p>
              <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-6 text-xl leading-relaxed">
                {SCRIPT_LECTURE}
              </p>
              <Button
                onClick={() => recorder.current?.stop()}
                variant="secondary"
                disabled={occupe}
              >
                {occupe ? "Analyse en cours..." : "J'ai terminé"}
              </Button>
            </>
          )}
          {erreurTraitement && (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <p>{erreurTraitement}</p>
              <div className="flex gap-3">
                <Button
                  onClick={() => webmBrut.current && void traiter(webmBrut.current)}
                  disabled={occupe}
                >
                  {occupe ? "Nouvelle tentative..." : "Réessayer"}
                </Button>
                <Button variant="secondary" onClick={() => void recommencer()}>
                  Recommencer
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {etape === "controle" && resultat && (
        <section className="space-y-4">
          <QualityReport resultat={resultat} />
          {erreurTraitement && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              {erreurTraitement}
            </div>
          )}
          {resultat.ok ? (
            <Button onClick={enregistrerProfil} disabled={occupe}>
              {occupe
                ? "Création de votre voix..."
                : erreurTraitement
                  ? "Réessayer"
                  : "Créer ma voix"}
            </Button>
          ) : (
            <Button onClick={() => void recommencer()} variant="secondary">
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
            endroit plus calme. Recommencer efface la voix qui vient d&apos;être créée.
          </p>
          {erreurTraitement && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              {erreurTraitement}
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={() => router.push("/brief")}>Cela me convient</Button>
            <Button
              variant="secondary"
              onClick={() => void recommencer()}
              disabled={occupe}
            >
              {occupe ? "Suppression de l'ancienne voix..." : "Recommencer"}
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
