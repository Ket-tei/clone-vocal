import { describe, expect, it, vi, beforeEach } from "vitest";
import { analyzeSample, generateScript, listProfiles } from "./api";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("client API", () => {
  it("envoie l'echantillon en multipart vers /api/voice/analyze", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, problems: [], metrics: {} }),
    });
    const fichier = new File([new Uint8Array([1, 2])], "e.wav", { type: "audio/wav" });
    const resultat = await analyzeSample(fichier);
    expect(resultat.ok).toBe(true);
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("/api/voice/analyze");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("remonte un message clair quand le backend est injoignable", async () => {
    (fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listProfiles()).rejects.toThrow(/backend/i);
  });

  it("remonte le detail d'erreur du backend", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Brief invalide" }),
    });
    await expect(generateScript({} as any)).rejects.toThrow(/Brief invalide/);
  });
});
