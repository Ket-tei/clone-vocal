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

async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}${chemin}`, options);
  } catch {
    throw new Error(
      "Le backend est injoignable. Lancez-le avec : uvicorn app.main:app --port 8000"
    );
  }
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => ({}));
    const detail = corps.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.problems?.join(" ") ?? `Erreur ${reponse.status}`;
    throw new Error(message);
  }
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
  await fetch(`${BASE}/api/voice/profiles/${id}`, { method: "DELETE" });
}

export async function previewVoice(id: string, text: string): Promise<Blob> {
  const reponse = await fetch(`${BASE}/api/voice/profiles/${id}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!reponse.ok) throw new Error("La previsualisation a echoue.");
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
