import { describe, expect, it } from "vitest";
import {
  MARQUES,
  MARQUES_MAX,
  NOMS_MARQUES,
  NOMS_SOCLES,
  SOCLES,
  tracerGlyphe,
  tropProches,
} from "../puzzles/lexicon/glyphes";

/**
 * Le vocabulaire de formes est de la mecanique publique : aucun de ces tests
 * ne touche a du contenu de partie.
 */

describe("vocabulaire de formes", () => {
  it("offre assez de socles pour la plus grande salle prevue", () => {
    // docs/puzzle-spec.md : salle 1 monte a 7 glyphes, et la regle de
    // continuite les fait reapparaitre plus tard.
    expect(NOMS_SOCLES.length).toBeGreaterThanOrEqual(6);
    expect(NOMS_MARQUES.length).toBeGreaterThanOrEqual(4);
  });

  it("ne produit que des traces SVG exploitables", () => {
    for (const trace of [...Object.values(SOCLES), ...Object.values(MARQUES)]) {
      expect(trace.startsWith("M")).toBe(true);
      // Tout tient dans la boite 0 0 100 100.
      for (const nombre of trace.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number(nombre)).toBeGreaterThanOrEqual(-1);
        expect(Number(nombre)).toBeLessThanOrEqual(101);
      }
    }
  });
});

describe("composition d'un glyphe", () => {
  it("concatene le socle et ses marques", () => {
    const trace = tracerGlyphe({ socle: "hampe", marques: ["barre-haute"] });
    expect(trace).toContain(SOCLES["hampe"] as string);
    expect(trace).toContain(MARQUES["barre-haute"] as string);
  });

  it("accepte un socle nu", () => {
    expect(tracerGlyphe({ socle: "boucle", marques: [] })).toBe(
      SOCLES["boucle"],
    );
  });

  it("refuse un socle ou une marque inconnus", () => {
    expect(() => tracerGlyphe({ socle: "spirale", marques: [] })).toThrow(
      /Socle/,
    );
    expect(() =>
      tracerGlyphe({ socle: "hampe", marques: ["auréole"] }),
    ).toThrow(/Marque/);
  });

  it("refuse un glyphe trop charge pour etre nomme", () => {
    const trop = NOMS_MARQUES.slice(0, MARQUES_MAX + 1);
    expect(() => tracerGlyphe({ socle: "hampe", marques: trop })).toThrow(
      /marques/,
    );
  });
});

describe("distinction a l'oral", () => {
  it("considere deux socles differents comme distinguables", () => {
    expect(
      tropProches(
        { socle: "hampe", marques: [] },
        { socle: "boucle", marques: [] },
      ),
    ).toBe(false);
  });

  it("refuse deux glyphes qui ne different que d'une marque", () => {
    expect(
      tropProches(
        { socle: "hampe", marques: ["crochet"] },
        { socle: "hampe", marques: ["crochet", "queue"] },
      ),
    ).toBe(true);
  });

  it("accepte deux glyphes de meme socle qui different de deux marques", () => {
    expect(
      tropProches(
        { socle: "hampe", marques: [] },
        { socle: "hampe", marques: ["crochet", "queue"] },
      ),
    ).toBe(false);
  });
});
