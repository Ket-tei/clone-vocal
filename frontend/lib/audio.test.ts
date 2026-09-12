import { describe, expect, it } from "vitest";
import { SCRIPT_LECTURE, encodeWav, rmsToDbfs } from "./audio";

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
  it("couvre les sons nasaux du francais", () => {
    for (const son of ["on", "an", "in", "un"]) {
      expect(SCRIPT_LECTURE.toLowerCase()).toContain(son);
    }
  });
  it("contient des chiffres, souvent mal rendus par les modeles", () => {
    expect(/\d/.test(SCRIPT_LECTURE)).toBe(true);
  });
});
