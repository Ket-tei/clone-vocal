import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioQueue, SCRIPT_LECTURE, encodeWav, rmsToDbfs } from "./audio";

describe("encodeWav", () => {
  async function entete(blob: Blob) {
    return new DataView(await blob.arrayBuffer());
  }

  it("produit un en-tete RIFF/WAVE", async () => {
    const vue = await entete(encodeWav(new Float32Array(10), 24000));
    const lire = (o: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => vue.getUint8(o + i)));
    expect(lire(0)).toBe("RIFF");
    expect(lire(8)).toBe("WAVE");
  });

  it("declare mono, 16 bits, a la frequence demandee", async () => {
    const vue = await entete(encodeWav(new Float32Array(10), 24000));
    expect(vue.getUint16(22, true)).toBe(1); // canaux
    expect(vue.getUint32(24, true)).toBe(24000); // frequence
    expect(vue.getUint16(34, true)).toBe(16); // bits par echantillon
  });

  it("ecrit deux octets par echantillon", async () => {
    const blob = encodeWav(new Float32Array(100), 24000);
    expect(blob.size).toBe(44 + 200);
  });

  it("borne les valeurs hors de l'intervalle [-1, 1]", async () => {
    const vue = await entete(encodeWav(new Float32Array([2, -2]), 24000));
    expect(vue.getInt16(44, true)).toBe(32767);
    expect(vue.getInt16(46, true)).toBe(-32768);
  });
});

describe("rmsToDbfs", () => {
  it("convertit un signal pleine echelle en 0 dBFS", () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 1);
  });
  it("convertit la moitie en environ -6 dBFS", () => {
    expect(rmsToDbfs(0.5)).toBeCloseTo(-6, 0);
  });
  it("ne renvoie jamais -Infinity sur un silence total", () => {
    expect(Number.isFinite(rmsToDbfs(0))).toBe(true);
  });
});

describe("script de lecture", () => {
  it("est assez long pour tenir les 30 secondes minimum", () => {
    // ~150 mots par minute a l'oral : 30 s exigent au moins 75 mots.
    expect(SCRIPT_LECTURE.split(/\s+/).length).toBeGreaterThanOrEqual(110);
  });
  it("couvre les quatre voyelles nasales du francais avec des mots precis", () => {
    // Des mots entiers choisis pour leur valeur phonetique (an/en, in, on, un),
    // verifies par limite de mot : `.toContain("on")` matcherait n'importe quel
    // texte francais un peu long (ex. "on" dans "bonjour") sans rien prouver.
    const motsNasaux = ["maintenant", "ensemble", "besoin", "matin", "bon", "un"];
    for (const mot of motsNasaux) {
      expect(SCRIPT_LECTURE.toLowerCase()).toMatch(new RegExp(`\\b${mot}\\b`));
    }
  });
  it("contient des chiffres, souvent mal rendus par les modeles", () => {
    expect(/\d/.test(SCRIPT_LECTURE)).toBe(true);
  });
});

describe("AudioQueue", () => {
  class AudioFactice {
    static instances: AudioFactice[] = [];
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    constructor(public src: string) {
      AudioFactice.instances.push(this);
    }
  }

  function preparer() {
    AudioFactice.instances = [];
    const revoquees: string[] = [];
    let compteur = 0;
    vi.stubGlobal("Audio", AudioFactice);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:${compteur++}`),
      revokeObjectURL: vi.fn((url: string) => revoquees.push(url)),
    });
    return { revoquees };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Laisse les micro-taches (then/await internes de AudioQueue) se resoudre.
  async function laisserPasser() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("lit les extraits strictement dans l'ordre d'arrivee", async () => {
    preparer();
    const file = new AudioQueue();
    const b1 = new Blob(["1"]);
    const b2 = new Blob(["2"]);
    const b3 = new Blob(["3"]);

    file.push(b1);
    file.push(b2);
    file.push(b3);
    await laisserPasser();
    expect(AudioFactice.instances).toHaveLength(1); // un seul extrait a la fois

    AudioFactice.instances[0].onended?.();
    await laisserPasser();
    expect(AudioFactice.instances).toHaveLength(2);

    AudioFactice.instances[1].onended?.();
    await laisserPasser();
    expect(AudioFactice.instances).toHaveLength(3);

    // Les URL sont creees dans l'ordre b1, b2, b3 : c'est bien cet ordre-la
    // qui a ete joue, quel que soit le moment ou chaque extrait a ete pousse.
    expect(AudioFactice.instances.map((a) => a.src)).toEqual(["blob:0", "blob:1", "blob:2"]);
  });

  it("un push pendant la lecture n'interrompt pas l'extrait en cours", async () => {
    preparer();
    const file = new AudioQueue();
    file.push(new Blob(["1"]));
    await laisserPasser();
    const premier = AudioFactice.instances[0];

    file.push(new Blob(["2"]));
    await laisserPasser();

    expect(AudioFactice.instances).toHaveLength(1);
    expect(premier.pause).not.toHaveBeenCalled();
    expect(file.isPlaying).toBe(true);
  });

  it("stop() vide la file, interrompt la lecture en cours et revoque son URL", async () => {
    const { revoquees } = preparer();
    const file = new AudioQueue();
    file.push(new Blob(["1"]));
    file.push(new Blob(["2"]));
    await laisserPasser();
    const enCours = AudioFactice.instances[0];

    file.stop();

    expect(enCours.pause).toHaveBeenCalled();
    expect(revoquees).toContain(enCours.src);
    expect(file.isPlaying).toBe(false);

    // La file etant videe, un nouvel envoi joue "3" et non le "2" en attente.
    file.push(new Blob(["3"]));
    await laisserPasser();
    expect(AudioFactice.instances).toHaveLength(2);
  });
});
