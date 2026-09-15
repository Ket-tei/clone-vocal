import { describe, expect, it } from "vitest";
import {
  DUREE_PAR_DEFAUT_S,
  DUREE_PREMIER_CHARGEMENT_S,
  avancement,
  estimerDureeS,
  formaterDuree,
} from "./progression";

describe("estimerDureeS", () => {
  it("prevoit un premier chargement du modele quand il n'est pas encore en memoire", () => {
    expect(estimerDureeS(false, [30, 32])).toBe(DUREE_PREMIER_CHARGEMENT_S);
  });

  it("reprend la duree par defaut sans mesure precedente", () => {
    expect(estimerDureeS(true, [])).toBe(DUREE_PAR_DEFAUT_S);
  });

  it("se cale sur la mediane des creations deja mesurees", () => {
    expect(estimerDureeS(true, [40, 200, 50])).toBe(50);
  });
});

describe("avancement", () => {
  it("part de zero", () => {
    expect(avancement(0, 60)).toBe(0);
  });

  it("atteint 90 % a la duree estimee", () => {
    expect(avancement(30, 60)).toBeCloseTo(45, 5);
    expect(avancement(60, 60)).toBeCloseTo(90, 5);
  });

  it("ralentit sans jamais atteindre 100 % tant que le serveur n'a pas repondu", () => {
    const apres = avancement(120, 60);
    expect(apres).toBeGreaterThan(90);
    expect(apres).toBeLessThan(99);
    expect(avancement(10_000, 60)).toBeLessThan(99);
  });
});

describe("formaterDuree", () => {
  it("affiche des secondes sous la minute", () => {
    expect(formaterDuree(45.4)).toBe("45 s");
  });

  it("affiche minutes et secondes au-dela", () => {
    expect(formaterDuree(150)).toBe("2 min 30 s");
    expect(formaterDuree(120)).toBe("2 min");
  });
});
