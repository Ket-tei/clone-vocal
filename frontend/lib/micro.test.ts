import { describe, expect, it } from "vitest";
import {
  CONTRAINTES_ENREGISTREMENT,
  PLANCHER_JAUGE_DBFS,
  SEUIL_SATURE_DBFS,
  SEUIL_TROP_FAIBLE_DBFS,
  niveauCrete,
  positionJauge,
  relacher,
  zoneNiveau,
} from "./micro";

describe("positionJauge", () => {
  it("met la bonne plage au centre, en trois zones de largeur egale", () => {
    expect(positionJauge(PLANCHER_JAUGE_DBFS)).toBeCloseTo(0, 5);
    expect(positionJauge(SEUIL_TROP_FAIBLE_DBFS)).toBeCloseTo(100 / 3, 5);
    expect(positionJauge(SEUIL_SATURE_DBFS)).toBeCloseTo(200 / 3, 5);
    expect(positionJauge(0)).toBeCloseTo(100, 5);
  });

  it("progresse lineairement a l'interieur de chaque zone", () => {
    expect(positionJauge(-45)).toBeCloseTo(100 / 6, 5); // milieu de la zone trop faible
    expect(positionJauge(-15.5)).toBeCloseTo(50, 5); // milieu de la bonne plage
  });

  it("reste bornee entre 0 et 100", () => {
    expect(positionJauge(-200)).toBe(0);
    expect(positionJauge(6)).toBe(100);
  });
});

describe("zoneNiveau", () => {
  it("juge comme le backend : trop faible sous -30, sature au-dessus de -1", () => {
    expect(zoneNiveau(-30.1)).toBe("faible");
    expect(zoneNiveau(-30)).toBe("correct");
    expect(zoneNiveau(-1)).toBe("correct");
    expect(zoneNiveau(-0.9)).toBe("sature");
  });
});

describe("seuils du vumetre", () => {
  it("reprennent ceux du controle qualite du backend", () => {
    // backend/app/audio/validation.py : PEAK_MIN_DBFS et PEAK_MAX_DBFS. Un
    // ecart ferait afficher « Niveau correct » a un enregistrement refuse.
    expect(SEUIL_TROP_FAIBLE_DBFS).toBe(-30);
    expect(SEUIL_SATURE_DBFS).toBe(-1);
  });
});

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
