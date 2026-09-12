import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  analyzeSample,
  deleteProfile,
  generateScript,
  listProfiles,
  previewVoice,
  qaSocketUrl,
} from "./api";

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
    expect((options.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("remonte un message clair quand le backend est injoignable", async () => {
    (fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listProfiles()).rejects.toThrow(/backend/i);
  });

  it("remonte le detail d'erreur du backend (chaine)", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Brief invalide" }),
    });
    await expect(generateScript({} as any)).rejects.toThrow(/Brief invalide/);
  });

  it("remonte le detail d'erreur du backend (liste de problemes)", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: { problems: ["Trop court.", "Trop bruite."] } }),
    });
    await expect(generateScript({} as any)).rejects.toThrow(/Trop court\..*Trop bruite\./);
  });

  it("transforme http en ws pour le websocket QA", () => {
    expect(qaSocketUrl("abc")).toMatch(/^ws:\/\/.*\/api\/qa\/abc$/);
  });

  it("transforme https en wss pour le websocket QA", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "https://127.0.0.1:8443";
    const { qaSocketUrl: qaSocketUrlHttps } = await import("./api");
    expect(qaSocketUrlHttps("abc")).toBe("wss://127.0.0.1:8443/api/qa/abc");
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  describe("deleteProfile", () => {
    it("leve une erreur si le profil n'existe pas (404)", async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Profil introuvable" }),
      });
      await expect(deleteProfile("id-inconnu")).rejects.toThrow(/Profil introuvable/);
    });

    it("remonte un message clair quand le backend est injoignable", async () => {
      (fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));
      await expect(deleteProfile("id")).rejects.toThrow(/backend/i);
    });
  });

  describe("previewVoice", () => {
    it("remonte le detail d'erreur du backend plutot qu'un message generique", async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: "Texte trop long" }),
      });
      await expect(previewVoice("id", "texte")).rejects.toThrow(/Texte trop long/);
    });
  });
});
