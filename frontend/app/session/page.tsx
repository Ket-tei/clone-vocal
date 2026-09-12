"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qaSocketUrl, type Brief, type Script } from "@/lib/api";
import { AudioQueue } from "@/lib/audio";

type Tour = { role: "user" | "assistant"; text: string };
type Contexte = { brief: Brief; script: Script; profilId: string };
type MessageEntrant = {
  type?: string;
  text?: string;
  wav_b64?: string;
  message?: string;
};

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
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef(new AudioQueue());

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
      } else if (message.type === "error") {
        // Le backend garde la connexion ouverte apres une erreur : on
        // l'affiche sans desactiver la session.
        setErreur(message.message ?? "Erreur inconnue renvoyée par le backend.");
      }
    };

    socket.onerror = () =>
      setErreur("Connexion au backend perdue. Vérifiez qu'il tourne sur le port 8000.");

    return () => {
      socket.close();
      // Sans cet arret, l'audio deja en file continuerait a jouer apres
      // avoir quitte la page.
      fileAudio.stop();
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

  if (!contexte) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground">Redirection vers le formulaire de brief...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">
          {contexte.brief.prospect_name} · {contexte.brief.company}
        </h1>
      </header>

      <section className="space-y-3 rounded-lg border bg-muted/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Votre présentation
        </h2>
        {contexte.script.blocks.map((b) => (
          <p key={b.kind} className="leading-relaxed">{b.text}</p>
        ))}
      </section>

      {erreur && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {erreur}
        </div>
      )}

      <section className="space-y-3">
        {tours.map((tour, i) => (
          <div
            key={i}
            className={`rounded-lg p-4 ${
              tour.role === "user" ? "bg-muted" : "border bg-background"
            }`}
          >
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              {tour.role === "user" ? "Question du prospect" : "Votre réponse"}
            </p>
            <p>{tour.text}</p>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <Input
          value={question}
          placeholder="Posez la question que poserait votre prospect..."
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          disabled={!pret}
        />
        <Button onClick={envoyer} disabled={!pret}>Envoyer</Button>
        <Button variant="secondary" onClick={() => queue.current.stop()}>
          Couper
        </Button>
      </div>
    </main>
  );
}
