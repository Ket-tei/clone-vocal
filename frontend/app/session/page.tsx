"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { qaSocketUrl, type Brief, type Script } from "@/lib/api";
import { AudioQueue, webmToWav } from "@/lib/audio";

const BOUTON =
  "w-fit bg-[var(--signal)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--encre)] disabled:opacity-50";
const BOUTON_SECONDAIRE =
  "w-fit border-2 border-[var(--encre)] px-6 py-3.5 text-base font-semibold transition-colors hover:bg-[var(--encre)] hover:text-[var(--papier)] disabled:opacity-50";
// Le micro en cours d'enregistrement est l'etat "on vous ecoute" : meme
// gabarit que BOUTON, mais dans le vermillon du vumetre sature.
const BOUTON_MICRO_ACTIF =
  "w-fit bg-[var(--brulure)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[var(--encre)] disabled:opacity-50";
// Trait bas plutot qu'une boite complete, comme dans le formulaire de brief.
const CHAMP =
  "rounded-none border-0 border-b-2 border-[var(--trait)] bg-transparent px-0 focus-visible:ring-0 focus:border-[var(--signal)]";

type Tour = { role: "user" | "assistant"; text: string };
type Contexte = { brief: Brief; script: Script; profilId: string };
type EtatMicro = "inactif" | "enregistrement" | "envoi";
type MessageEntrant = {
  type?: string;
  text?: string;
  wav_b64?: string;
  message?: string;
};

/** Symetrique du decodage cote reception : pas de prefixe data:, juste le base64. */
async function blobVersBase64(blob: Blob): Promise<string> {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = "";
  for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
  return btoa(binaire);
}

/**
 * sessionStorage peut contenir une valeur d'une ancienne version de
 * l'application ou corrompue : on ne fait jamais confiance a son contenu
 * sans le verifier, sous peine de planter la page au chargement.
 */
function lireContexte(): Contexte | null {
  const brut = sessionStorage.getItem("session");
  if (!brut) return null;
  try {
    const ctx = JSON.parse(brut) as Partial<Contexte> | null;
    if (
      ctx && typeof ctx === "object" &&
      ctx.brief && typeof ctx.brief === "object" &&
      ctx.script && Array.isArray(ctx.script.blocks) &&
      typeof ctx.profilId === "string" && ctx.profilId
    ) {
      return ctx as Contexte;
    }
    return null;
  } catch {
    return null;
  }
}

export default function PageSession() {
  const router = useRouter();
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [question, setQuestion] = useState("");
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [micEtat, setMicEtat] = useState<EtatMicro>("inactif");
  const [presentationEnCours, setPresentationEnCours] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef(new AudioQueue());
  const micStream = useRef<MediaStream | null>(null);
  const micRecorder = useRef<MediaRecorder | null>(null);
  const micMorceaux = useRef<Blob[]>([]);

  useEffect(() => {
    // Sans profil valide, aucune connexion n'est possible : on renvoie tout
    // de suite vers le formulaire plutot que de laisser une page inerte.
    const chargerContexte = () => {
      const ctx = lireContexte();
      if (!ctx) {
        router.replace("/brief");
        return null;
      }
      setContexte(ctx);
      return ctx;
    };
    const ctx = chargerContexte();
    if (!ctx) return;

    // Capture stable : la valeur de queue.current ne change jamais en
    // pratique (le ref n'est jamais reassigne), mais on evite ainsi toute
    // dependance implicite sur sa valeur au moment du nettoyage.
    const fileAudio = queue.current;
    const socket = new WebSocket(qaSocketUrl(ctx.profilId));
    ws.current = socket;
    // Distingue notre propre fermeture (demontage) d'une fermeture subie.
    let fermetureVoulue = false;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "context", brief: ctx.brief, script: ctx.script }));
      setPret(true);
    };

    socket.onmessage = (event) => {
      let message: MessageEntrant;
      try {
        message = JSON.parse(event.data);
      } catch {
        setErreur("Message illisible reçu du backend.");
        return;
      }
      if (message.type === "question") {
        setTours((t) => [...t, { role: "user", text: message.text ?? "" }]);
      } else if (message.type === "sentence") {
        setTours((t) => {
          const dernier = t[t.length - 1];
          if (dernier?.role === "assistant") {
            return [...t.slice(0, -1), { ...dernier, text: `${dernier.text} ${message.text}` }];
          }
          return [...t, { role: "assistant", text: message.text ?? "" }];
        });
      } else if (message.type === "audio") {
        try {
          const octets = Uint8Array.from(atob(message.wav_b64 ?? ""), (c) => c.charCodeAt(0));
          fileAudio.push(new Blob([octets], { type: "audio/wav" }));
        } catch {
          setErreur("Audio de réponse illisible ; le texte de la réponse reste disponible.");
        }
      } else if (message.type === "done") {
        setPresentationEnCours(false);
      } else if (message.type === "error") {
        // Le backend garde la connexion ouverte apres une erreur : on
        // l'affiche sans desactiver la session.
        setErreur(message.message ?? "Erreur inconnue renvoyée par le backend.");
        // Sans cette remise a zero, une erreur pendant la presentation
        // laisserait le bouton desactive pour toujours.
        setPresentationEnCours(false);
      }
    };

    socket.onerror = () =>
      setErreur("Connexion au backend perdue. Vérifiez qu'il tourne sur le port 8000.");

    // Sans ce gestionnaire, une fermeture subie (le backend a leve une
    // exception non rattrapee pendant la synthese, par exemple) laissait
    // l'interface figee : boutons actifs, envois silencieusement perdus,
    // aucun message. On desactive la session et on dit quoi faire.
    socket.onclose = () => {
      if (fermetureVoulue) return;
      setPret(false);
      setPresentationEnCours(false);
      setMicEtat("inactif");
      setErreur(
        "La connexion au backend s'est fermée. Rechargez la page pour reprendre " +
          "la session (votre brief et votre script sont conservés)."
      );
    };

    return () => {
      fermetureVoulue = true;
      socket.close();
      // Sans cet arret, l'audio deja en file continuerait a jouer apres
      // avoir quitte la page.
      fileAudio.stop();
      // Filet de securite : si l'utilisateur quitte pendant un
      // enregistrement, le micro ne doit pas rester allume.
      micStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  function envoyer() {
    const texte = question.trim();
    if (!texte || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    try {
      ws.current.send(JSON.stringify({ type: "question", text: texte }));
      setQuestion("");
    } catch {
      setErreur("Échec de l'envoi de la question. Réessayez.");
    }
  }

  /**
   * Fait prononcer la presentation avec la voix clonee. Le backend renvoie
   * les memes messages sentence + audio que la boucle question/reponse : rien
   * de neuf a traiter cote client, AudioQueue enchaine deja les extraits.
   */
  function lancerPresentation() {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setErreur("La connexion au backend n'est plus active.");
      return;
    }
    setErreur(null);
    setPresentationEnCours(true);
    try {
      ws.current.send(JSON.stringify({ type: "present" }));
    } catch {
      setPresentationEnCours(false);
      setErreur("Échec de l'envoi de la présentation. Réessayez.");
    }
  }

  function couper() {
    queue.current.stop();
    setPresentationEnCours(false);
  }

  function arreterMicro() {
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
  }

  async function envoyerEnregistrement(webm: Blob) {
    setMicEtat("envoi");
    try {
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        throw new Error("La connexion au backend n'est plus active.");
      }
      // Obligatoire : le backend (soundfile) ne lit pas le WebM produit par
      // MediaRecorder.
      const wav = await webmToWav(webm);
      const wav_b64 = await blobVersBase64(wav);
      ws.current.send(JSON.stringify({ type: "audio", wav_b64 }));
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "Erreur inattendue lors de l'envoi de votre question au micro."
      );
    } finally {
      setMicEtat("inactif");
    }
  }

  async function demarrerMicro() {
    setErreur(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = stream;
      micMorceaux.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => micMorceaux.current.push(e.data);
      recorder.onstop = () => {
        // Le flux n'est plus necessaire une fois l'enregistrement capture :
        // on coupe le micro tout de suite, avant meme l'envoi au backend.
        arreterMicro();
        void envoyerEnregistrement(new Blob(micMorceaux.current, { type: "audio/webm" }));
      };
      micRecorder.current = recorder;
      recorder.start();
      setMicEtat("enregistrement");
    } catch {
      setErreur(
        "Micro refusé ou introuvable. Autorisez l'accès au micro dans la barre " +
          "d'adresse de votre navigateur, puis réessayez."
      );
    }
  }

  function arreterEnregistrement() {
    micRecorder.current?.stop();
  }

  if (!contexte) {
    return (
      <main className="flex flex-1 flex-col">
        <div className="enveloppe flex flex-1 flex-col justify-center py-16">
          <p className="sous-titre">Redirection vers le formulaire de brief…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="enveloppe space-y-2 py-8">
        <h1 className="titre">{contexte.brief.prospect_name}</h1>
        <p className="sous-titre">{contexte.brief.company}</p>
      </header>

      {/* Bande pleine largeur : le script est un objet a part, pas une carte
          parmi d'autres. Fond legerement souleve pour le distinguer du papier. */}
      <div className="bande bg-[var(--papier-vif)]">
        <div className="enveloppe space-y-5 py-8">
          <h2 className="text-lg font-semibold">Votre présentation</h2>
          <div className="space-y-4">
            {contexte.script.blocks.map((b) => (
              <p key={b.kind} className="a-lire whitespace-pre-line">{b.text}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={lancerPresentation}
            disabled={!pret || presentationEnCours}
            className={BOUTON}
          >
            {presentationEnCours ? "Présentation en cours…" : "Lancer la présentation"}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="enveloppe py-6">
          <div className="avis avis-erreur">{erreur}</div>
        </div>
      )}

      <div className="enveloppe space-y-8 py-8">
        <div className="space-y-4">
          {tours.map((tour, i) => (
            <div
              key={i}
              className={
                tour.role === "user"
                  ? "bg-[var(--muted)] p-4"
                  : "border-l-4 border-[var(--signal)] p-4"
              }
            >
              <p className="mb-1 text-sm font-medium text-[var(--estompe)]">
                {tour.role === "user" ? "Question du prospect" : "Votre réponse"}
              </p>
              <p className="leading-relaxed">{tour.text}</p>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <Input
            value={question}
            placeholder="Posez la question que poserait votre prospect…"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && envoyer()}
            disabled={!pret}
            className={CHAMP}
          />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={envoyer} disabled={!pret} className={BOUTON}>
              Envoyer
            </button>
            <button
              type="button"
              onClick={micEtat === "enregistrement" ? arreterEnregistrement : () => void demarrerMicro()}
              disabled={!pret || micEtat === "envoi"}
              className={micEtat === "enregistrement" ? BOUTON_MICRO_ACTIF : BOUTON_SECONDAIRE}
            >
              {micEtat === "enregistrement"
                ? "Arrêter l'enregistrement"
                : micEtat === "envoi"
                  ? "Envoi de la question…"
                  : "Poser au micro"}
            </button>
            <button type="button" onClick={couper} className={BOUTON_SECONDAIRE}>
              Couper
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
