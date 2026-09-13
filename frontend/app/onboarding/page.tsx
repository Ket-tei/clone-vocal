"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicLevelMeter } from "@/components/MicLevelMeter";
import { QualityReport } from "@/components/QualityReport";
import {
  analyzeSample,
  createProfile,
  deleteProfile,
  previewVoice,
  type AnalyzeResult,
} from "@/lib/api";
import { SCRIPT_LECTURE, webmToWav } from "@/lib/audio";
import { CONTRAINTES_ENREGISTREMENT } from "@/lib/micro";

type Etape = "autorisation" | "micro" | "lecture" | "controle" | "validation";

const BOUTON =
  "w-fit bg-[var(--signal)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--encre)] disabled:opacity-50";
const BOUTON_SECONDAIRE =
  "w-fit border-2 border-[var(--encre)] px-6 py-3.5 text-base font-semibold transition-colors hover:bg-[var(--encre)] hover:text-[var(--papier)] disabled:opacity-50";

// Vrai lorsque l'application tourne sans GPU (demonstration d'interface) :
// la synthese rend alors un audio silencieux, il faut le dire a l'utilisateur.
const MODE_DEMO = process.env.NEXT_PUBLIC_MODE_DEMO === "1";

function messageErreur(e: unknown, repli: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return repli;
}

export default function Onboarding() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("autorisation");
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
      setStream(
        await navigator.mediaDevices.getUserMedia({ audio: CONTRAINTES_ENREGISTREMENT })
      );
      setErreurMicro(null);
      setEtape("micro");
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
    // Le micro a ete coupe a la fin de l'enregistrement : il faut le rouvrir.
    setEtape("autorisation");
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

  const etapes: Etape[] = ["autorisation", "micro", "lecture", "controle", "validation"];
  const rang = etapes.indexOf(etape);

  return (
    <main className="flex flex-1 flex-col">
      {/* Fil d'etapes : un trait qui se remplit. Des pastilles numerotees
          suggereraient un formulaire administratif ; ici c'est une prise de son. */}
      <div className="enveloppe pt-6">
        <div className="fil" aria-label={`Étape ${rang + 1} sur ${etapes.length}`}>
          {etapes.map((e, i) => (
            <span key={e} className="fil-segment" data-fait={i <= rang ? "oui" : "non"} />
          ))}
        </div>
      </div>

      {etape === "autorisation" && (
        <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-12">
          <div className="space-y-4">
            <h1 className="titre">Autorisez votre micro</h1>
            <p className="sous-titre">
              Votre navigateur va vous demander l&apos;accès au micro. Rien
              n&apos;est enregistré à cette étape.
            </p>
          </div>

          <button type="button" onClick={autoriserMicro} className={BOUTON}>
            Autoriser le micro
          </button>

          {erreurMicro && <div className="avis avis-erreur">{erreurMicro}</div>}
        </div>
      )}

      {etape === "micro" && stream && (
        <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-12">
          <div className="space-y-4">
            <h1 className="titre">Réglons votre micro</h1>
            <p className="sous-titre">
              Parlez normalement. Le niveau doit rester entre les deux repères.
            </p>
          </div>

          <MicLevelMeter stream={stream} />
          <button type="button" onClick={demarrer} className={BOUTON}>
            Commencer l&apos;enregistrement
          </button>
        </div>
      )}

      {etape === "lecture" && (
        <>
          <div className="bande-brulure">
            <div className="enveloppe flex items-center gap-3 py-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-white" />
              <p className="text-sm font-semibold">Enregistrement en cours</p>
            </div>
          </div>
          <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-10">
            <p className="text-[0.95rem] font-medium">
              Lisez ce texte à voix haute, à votre rythme habituel.
            </p>
            <p className="a-lire whitespace-pre-line">{SCRIPT_LECTURE}</p>
            <button
              type="button"
              onClick={() => recorder.current?.stop()}
              className={BOUTON_SECONDAIRE}
            >
              J&apos;ai terminé
            </button>
          </div>
        </>
      )}

      {etape === "controle" && (
        <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-12">
          <h1 className="titre">
            {resultat?.ok ? "Enregistrement accepté" : "Il faut recommencer"}
          </h1>

          {occupe && <p className="sous-titre">Analyse de votre enregistrement…</p>}
          {resultat && <QualityReport resultat={resultat} />}

          {erreurTraitement && (
            <div className="space-y-3">
              <div className="avis avis-erreur">{erreurTraitement}</div>
              <button
                type="button"
                onClick={() => webmBrut.current && void traiter(webmBrut.current)}
                disabled={occupe}
                className={BOUTON}
              >
                Réessayer
              </button>
            </div>
          )}

          {!occupe && resultat && (
            <div className="flex flex-wrap gap-3">
              {resultat.ok ? (
                <button
                  type="button"
                  onClick={enregistrerProfil}
                  disabled={occupe}
                  className={BOUTON}
                >
                  {occupe ? "Création de votre voix…" : "Créer ma voix"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void recommencer()}
                  className={BOUTON}
                >
                  Recommencer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {etape === "validation" && (
        <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-12">
          {MODE_DEMO ? (
            <>
              <h1 className="titre">Votre voix est enregistrée</h1>
              <div className="avis avis-chaud">
                <p className="font-semibold">Synthèse vocale indisponible sur ce serveur.</p>
                <p className="mt-1">
                  Cette démonstration tourne sans carte graphique : l&apos;extrait que
                  vous venez d&apos;entendre est silencieux. Votre enregistrement a bien
                  été analysé et accepté — seule la synthèse exige un GPU.
                </p>
              </div>
            </>
          ) : (
            <>
              <h1 className="titre">Écoutez-vous</h1>
              <p className="sous-titre">
                Voici votre voix prononçant une phrase que vous n&apos;avez jamais
                enregistrée. Si le résultat ne vous convainc pas, refaites
                l&apos;enregistrement dans un endroit plus calme.
              </p>
            </>
          )}

          {erreurTraitement && <div className="avis avis-erreur">{erreurTraitement}</div>}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => router.push("/brief")} className={BOUTON}>
              Cela me convient
            </button>
            <button
              type="button"
              onClick={() => void recommencer()}
              disabled={occupe}
              className={BOUTON_SECONDAIRE}
            >
              {occupe ? "Suppression de l'ancienne voix…" : "Recommencer"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
