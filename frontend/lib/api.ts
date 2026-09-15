const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type VoiceProfile = {
  id: string; label: string; created_at: string; sample_path: string;
  duration_s: number; snr_db: number; peak_dbfs: number; engine: string;
};
export type AnalyzeResult = {
  ok: boolean;
  problems: string[];
  metrics: { duration_s: number; peak_dbfs: number; silence_ratio: number; snr_db: number };
};
export type Brief = {
  prospect_name: string; company: string; role: string; stake: string; goal: string;
  expected_objections: string[]; tone: string; target_duration_min: number;
};
export type ScriptBlock = { kind: string; text: string };
export type Script = { blocks: ScriptBlock[] };

async function requete(chemin: string, options?: RequestInit): Promise<Response> {
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, options);
  } catch {
    // fetch ne distingue pas un backend eteint d'une requete bloquee par le
    // navigateur (CORS) : le message doit couvrir les deux, sous peine
    // d'envoyer l'utilisateur relancer un serveur qui tourne deja.
    throw new Error(
      "Le backend n'a pas répondu. Vérifiez qu'il tourne " +
        "(uvicorn app.main:app --port 8000) et que vous ouvrez l'interface " +
        "sur http://localhost:3000 ou http://127.0.0.1:3000."
    );
  }
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => ({}));
    const detail = (corps as { detail?: unknown }).detail;
    const problemes = (detail as { problems?: unknown })?.problems;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(problemes)
          ? problemes.join(" ")
          : `Erreur ${reponse.status}`;
    throw new Error(message);
  }
  return reponse;
}

async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await requete(chemin, options);
  if (reponse.status === 204) return undefined as T;
  return reponse.json() as Promise<T>;
}

export async function analyzeSample(file: File): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append("file", file);
  return appeler<AnalyzeResult>("/api/voice/analyze", { method: "POST", body: form });
}

export async function createProfile(file: File, label: string): Promise<VoiceProfile> {
  const form = new FormData();
  form.append("file", file);
  form.append("label", label);
  return appeler<VoiceProfile>("/api/voice/profiles", { method: "POST", body: form });
}

export async function listProfiles(): Promise<VoiceProfile[]> {
  return appeler<VoiceProfile[]>("/api/voice/profiles");
}

export async function deleteProfile(id: string): Promise<void> {
  await requete(`/api/voice/profiles/${id}`, { method: "DELETE" });
}

/** Le modele vocal est-il deja en memoire ? Sert a estimer la duree de creation. */
export async function voiceStatus(): Promise<{ modele_charge: boolean }> {
  return appeler<{ modele_charge: boolean }>("/api/voice/status");
}

export async function previewVoice(id: string, text: string): Promise<Blob> {
  const reponse = await requete(`/api/voice/profiles/${id}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return reponse.blob();
}

export async function generateScript(brief: Brief): Promise<Script> {
  return appeler<Script>("/api/meeting/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(brief),
  });
}

export function qaSocketUrl(profilId: string): string {
  return `${BASE.replace(/^http/, "ws")}/api/qa/${profilId}`;
}
