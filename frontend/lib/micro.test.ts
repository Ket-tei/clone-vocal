import { describe, expect, it } from "vitest";
import { CONTRAINTES_ENREGISTREMENT, niveauCrete, relacher } from "./micro";

describe("contraintes d'enregistrement", () => {
  it("desactivent les traitements du navigateur qui faussent le niveau", () => {
    // Mesure dans Chrome : avec le gain automatique, une voix a -30 dBFS de
    // crete et une autre a -3 dBFS s'affichaient a 10 dB d'ecart au lieu de
    // 27, et la seconde etait ecretee a 0 dBFS avant d'atteindre le backend.
    expect(CONTRAINTES_ENREGISTREMENT).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});

describe("niveauCrete", () => {
  it("mesure la crete, comme le controle qualite du backend, et non le RMS", () => {
    // Une seule impulsion a -6 dBFS : son RMS sur 1024 echantillons tombe
    // vers -36 dBFS, alors que le backend la jugerait a -6.
    const tampon = new Float32Array(1024);
    tampon[100] = -0.5;
    expect(niveauCrete(tampon)).toBeCloseTo(-6, 0);
  });

  it("ne renvoie jamais -Infinity sur un silence total", () => {
    expect(Number.isFinite(niveauCrete(new Float32Array(1024)))).toBe(true);
  });
});

describe("relacher", () => {
  it("monte instantanement sur une crete plus forte", () => {
    expect(relacher(-40, -10, 0.016)).toBe(-10);
  });

  it("redescend a vitesse constante au lieu de retomber d'un coup", () => {
    // 0,5 s de silence apres une crete a -10 dBFS, a 20 dB par seconde.
    expect(relacher(-10, -200, 0.5)).toBeCloseTo(-20, 5);
  });

  it("ne descend jamais sous la mesure courante", () => {
    expect(relacher(-10, -12, 1)).toBe(-12);
  });
});
