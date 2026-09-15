"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FilEtapes } from "@/components/FilEtapes";
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

const ETAPES = [
  { id: "autorisation", nom: "Autorisation" },
  { id: "micro", nom: "Réglage" },
  { id: "lecture", nom: "Lecture" },
  { id: "controle", nom: "Contrôle" },
  { id: "validation", nom: "Validation" },
] as const;

type Etape = (typeof ETAPES)[number]["id"];

const PARAM_ETAPE = "etape";

/** Rang de l'etape inscrite dans l'URL ; sans parametre, c'est la premiere. */
function rangDansUrl(): number {
  const id = new URLSearchParams(window.location.search).get(PARAM_ETAPE);
  return Math.max(0, ETAPES.findIndex((e) => e.id === id));
}

const BOUTON =
  "w-fit bg-[var(--signal)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--encre)] disabled:opacity-50";
const BOUTON_SECONDAIRE =
  "w-fit border-2 border-[var(--encre)] px-6 py-3.5 text-base font-semibold transition-colors hover:bg-[var(--encre)] hover:text-[var(--papier)] disabled:opacity-50";

const MICRO_REFUSE =
  "Micro refusé ou introuvable. Autorisez l'accès au micro dans la barre " +
  "d'adresse de votre navigateur, puis rechargez cette page.";

const ouvrirMicro = () =>
  navigator.mediaDevices.getUserMedia({ audio: CONTRAINTES_ENREGISTREMENT });

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
  // Identifiant du profil deja cree pour l'enregistrement courant. Sans lui,
  // refaire la lecture laisserait un echantillon de la voix sur le disque a
  // chaque passage : deux enregistrements = deux WAV biometriques conserves.
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
      setStream(await ouvrirMicro());
      setErreurMicro(null);
      setEtape("micro");
    } catch {
      setErreurMicro(MICRO_REFUSE);
    }
  }

  /**
   * Efface le profil deja cree. Renvoie faux si la suppression echoue : on
   * reste alors sur place avec un message, car continuer en silence laisserait
   * l'utilisateur croire que son ancien enregistrement a disparu.
   */
  async function effacerProfilCree(): Promise<boolean> {
    const ancien = profilCree.current;
    if (!ancien) return true;
    setOccupe(true);
    try {
      await deleteProfile(ancien);
      profilCree.current = null;
      return true;
    } catch (e) {
      setErreurTraitement(
        messageErreur(e, "Impossible de supprimer l'enregistrement précédent.") +
          " Votre ancienne voix est peut-être toujours sur le disque ; réessayez."
      );
      return false;
    } finally {
      setOccupe(false);
    }
  }

  /**
   * Ramene a une etape deja franchie. Revenir avant le controle, c'est refaire
   * l'enregistrement : celui en cours est abandonne sans analyse, et la voix
   * deja creee est effacee.
   */
  async function revenirA(cible: Etape) {
    if (cible === "controle") {
      setEtape("controle");
      return;
    }
    setErreurTraitement(null);
    if (!(await effacerProfilCree())) return;
    setEnregistre(null);
    setResultat(null);

    // Sans ses gestionnaires, l'arret ne declenche ni l'analyse ni la coupure du micro.
    const mr = recorder.current;
    if (mr && mr.state !== "inactive") {
      mr.onstop = null;
      mr.ondataavailable = null;
      mr.stop();
    }

    if (cible === "autorisation") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setEtape("autorisation");
      return;
    }

    // Reglage ou lecture : il faut un micro ouvert. S'il a ete coupe a la fin
    // d'un enregistrement, on le rouvre sans redemander d'autorisation.
    let flux = streamRef.current;
    if (!flux || flux.getTracks().some((t) => t.readyState === "ended")) {
      try {
        flux = await ouvrirMicro();
      } catch {
        setStream(null);
        setErreurMicro(MICRO_REFUSE);
        setEtape("autorisation");
        return;
      }
      setStream(flux);
    }
    if (cible === "micro") setEtape("micro");
    else demarrer(flux);
  }

  function demarrer(flux: MediaStream) {
    morceaux.current = [];
    const mr = new MediaRecorder(flux);
    mr.ondataavailable = (e) => morceaux.current.push(e.data);
    mr.onstop = () => {
      // Le flux n'est plus necessaire une fois l'enregistrement capture : on
      // coupe le micro tout de suite, avant meme de savoir si le traitement
      // reussira. Un micro qui reste ouvert n'a rien a faire ici.
      flux.getTracks().forEach((t) => t.stop());
      setStream(null);
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
      // Revenu au controle depuis la validation : la voix de cet enregistrement
      // existe deja, la recreer laisserait un doublon sur le disque.
      const id =
        profilCree.current ??
        (await createProfile(new File([enregistre], "e.wav", { type: "audio/wav" }), "Ma voix")).id;
      profilCree.current = id;
      const audioBlob = await previewVoice(
        id,
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

  const rang = ETAPES.findIndex((e) => e.id === etape);

  // --- Historique du navigateur -------------------------------------------
  // Chaque etape franchie ajoute une entree (?etape=...), de sorte que la
  // fleche retour ramene a l'etape precedente au lieu de quitter l'onboarding.
  // On avance toujours d'une etape a la fois : la profondeur dans l'historique
  // est donc le rang de l'etape affichee dans l'URL.
  const [resynchro, setResynchro] = useState(0);
  const retourEnCours = useRef(false);

  // Au rechargement, l'etat est perdu et l'on repart de l'autorisation :
  // l'URL ne doit plus pretendre a une etape plus avancee.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Aligne l'historique sur l'etape affichee, quelle que soit la facon dont on
  // y est arrive (bouton, fil d'etapes, echec qui ramene en arriere...).
  useEffect(() => {
    if (retourEnCours.current) return;
    const ecart = rang - rangDansUrl();
    if (ecart > 0) {
      for (let i = rang - ecart + 1; i <= rang; i++) {
        window.history.pushState(null, "", `?${PARAM_ETAPE}=${ETAPES[i].id}`);
      }
    } else if (ecart < 0) {
      retourEnCours.current = true;
      window.history.go(ecart);
    }
  }, [rang, resynchro]);

  const surPopstate = useRef<() => void>(() => {});
  useEffect(() => {
    surPopstate.current = () => {
      if (retourEnCours.current) {
        retourEnCours.current = false;
        setResynchro((n) => n + 1);
        return;
      }
      const cible = rangDansUrl();
      if (cible === rang) return;
      // Fleche avant (on ne peut pas sauter une etape) ou traitement en cours :
      // on remet l'historique d'accord avec l'etape affichee.
      if (cible > rang || occupe) {
        setResynchro((n) => n + 1);
        return;
      }
      void revenirA(ETAPES[cible].id).finally(() => setResynchro((n) => n + 1));
    };
  });

  // Ecouteur pose une seule fois. Le routeur Next, qui ecoute avant nous, fait
  // un rendu synchrone pendant l'evenement : un ecouteur repose a chaque rendu
  // serait retire en plein vol et ne recevrait jamais le retour.
  useEffect(() => {
    const ecouter = () => surPopstate.current();
    window.addEventListener("popstate", ecouter);
    return () => window.removeEventListener("popstate", ecouter);
  }, []);

  return (
    <main className="flex flex-1 flex-col">
      <div className="enveloppe pt-6">
        <FilEtapes
          noms={ETAPES.map((e) => e.nom)}
          rang={rang}
          surRetour={(i) => void revenirA(ETAPES[i].id)}
          bloque={occupe}
        />
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
          <button type="button" onClick={() => demarrer(stream)} className={BOUTON}>
            Commencer l&apos;enregistrement
          </button>
        </div>
      )}

      {etape === "lecture" && (
        <div className="enveloppe flex flex-1 flex-col justify-center gap-8 py-10">
          <p
            role="status"
            className="flex items-center gap-2.5 text-base font-semibold text-[var(--brulure)]"
          >
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--brulure)]" />
            Enregistrement en cours
          </p>
          <p className="text-[0.95rem] font-medium">
            Lisez ce texte à voix haute, à votre rythme habituel.
          </p>
          {/* Toute la largeur de la colonne : les retours a la ligne du script
              ne servent qu'a la mise en forme du code, le texte coule librement. */}
          <p className="a-lire max-w-none">{SCRIPT_LECTURE}</p>
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className={BOUTON}
          >
            J&apos;ai terminé
          </button>
        </div>
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
                  onClick={() => void revenirA("lecture")}
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
              onClick={() => void revenirA("lecture")}
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
