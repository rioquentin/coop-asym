import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CHAINE_DES_SALLES } from "../content/chaine";
import {
  chargerDefinition,
  chiffrer,
  cleContenu,
  dechiffrer,
  modeContenu,
  oublierDefinitions,
  validerDefinition,
} from "../content/loader";
import { chargerModule, modulesConnus } from "../puzzles/registry";
import type { PuzzleDefinition } from "../content/types";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOSSIER_PROD = join(RACINE, "content/prod");
const NOM_TEMOIN = "__temoin-de-test";

const envInitial = {
  NODE_ENV: process.env["NODE_ENV"],
  CONTENT_KEY: process.env["CONTENT_KEY"],
};

function restaurerEnv(): void {
  if (envInitial.NODE_ENV === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = envInitial.NODE_ENV;
  if (envInitial.CONTENT_KEY === undefined) delete process.env["CONTENT_KEY"];
  else process.env["CONTENT_KEY"] = envInitial.CONTENT_KEY;
  oublierDefinitions();
}

afterEach(() => {
  restaurerEnv();
  rmSync(join(DOSSIER_PROD, `${NOM_TEMOIN}.enc`), { force: true });
});

describe("mode de chargement", () => {
  it("est dev par defaut", () => {
    expect(modeContenu()).toBe("dev");
  });

  it("refuse de demarrer en production sans cle", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["CONTENT_KEY"];
    // Le mode degrade serait de servir la fixture bidon a de vrais joueurs.
    expect(() => modeContenu()).toThrow(/CONTENT_KEY/);
  });

  it("exige une cle de 32 octets", () => {
    process.env["CONTENT_KEY"] = "trop-court";
    expect(() => cleContenu()).toThrow(/32 octets/);
  });
});

describe("contenu de developpement", () => {
  it("charge la fixture et la valide contre le schema", () => {
    const definition = chargerDefinition(CHAINE_DES_SALLES[0]);

    expect(definition.room).toBe(1);
    expect(definition.primitives).toContain("LEXIQUE");
    expect(definition.roles.A.canAct).toBe(true);
    expect(definition.roles.B.canAct).toBe(true);
    expect(definition.budget.maxDiscreteElements).toBeLessThanOrEqual(15);
  });

  it("designe un module enregistre", () => {
    const definition = chargerDefinition(CHAINE_DES_SALLES[0]);
    expect(modulesConnus()).toContain(definition.module);
  });
});

describe("validation contre le schema", () => {
  const base = (): PuzzleDefinition =>
    JSON.parse(
      JSON.stringify(chargerDefinition(CHAINE_DES_SALLES[0])),
    ) as PuzzleDefinition;

  it("refuse un budget au-dessus du plafond C1", () => {
    const cassee = base();
    cassee.budget.maxDiscreteElements = 99;
    expect(() => validerDefinition(cassee, "cassee")).toThrow(/schema/);
  });

  it("refuse un role qui ne peut pas agir", () => {
    const cassee = base();
    (cassee.roles.B as { canAct: boolean }).canAct = false;
    expect(() => validerDefinition(cassee, "cassee")).toThrow(/schema/);
  });

  it("refuse une enigme qui se remet a zero en cas d'echec", () => {
    const cassee = base();
    cassee.failure = { ...cassee.failure, resetsPuzzle: true as never };
    expect(() => validerDefinition(cassee, "cassee")).toThrow(/schema/);
  });

  it("refuse une primitive inventee", () => {
    const cassee = base();
    cassee.primitives = ["TELEPATHIE" as never];
    expect(() => validerDefinition(cassee, "cassee")).toThrow(/schema/);
  });
});

describe("registre des modules", () => {
  it("refuse un chemin de module inconnu", () => {
    const definition = JSON.parse(
      JSON.stringify(chargerDefinition(CHAINE_DES_SALLES[0])),
    ) as PuzzleDefinition;
    definition.module = "src/puzzles/inexistant/index.ts";

    expect(() => chargerModule(definition)).toThrow(/module inconnu/);
  });

  it("refuse un contenu incoherent avec sa primitive", () => {
    const definition = JSON.parse(
      JSON.stringify(chargerDefinition(CHAINE_DES_SALLES[0])),
    ) as PuzzleDefinition;
    (definition.content as { slots: number }).slots = 99;

    expect(() => chargerModule(definition)).toThrow(/invalide/);
  });
});

describe("contenu de production", () => {
  it("fait un aller-retour de chiffrement fidele", () => {
    const cle = randomBytes(32);
    const clair = JSON.stringify({ salut: "monde", n: 42 });
    expect(dechiffrer(chiffrer(clair, cle), cle)).toBe(clair);
  });

  it("refuse un paquet chiffre avec une autre cle", () => {
    const paquet = chiffrer("secret", randomBytes(32));
    // AES-GCM authentifie : une mauvaise cle echoue, elle ne rend pas du bruit.
    expect(() => dechiffrer(paquet, randomBytes(32))).toThrow();
  });

  it("refuse un paquet tronque", () => {
    expect(() => dechiffrer(Buffer.alloc(4), randomBytes(32))).toThrow(
      /tronque/,
    );
  });

  it("charge une definition chiffree de bout en bout", () => {
    const cle = randomBytes(32);
    const source = chargerDefinition(CHAINE_DES_SALLES[0]);

    mkdirSync(DOSSIER_PROD, { recursive: true });
    writeFileSync(
      join(DOSSIER_PROD, `${NOM_TEMOIN}.enc`),
      chiffrer(JSON.stringify(source), cle),
    );

    oublierDefinitions();
    process.env["NODE_ENV"] = "production";
    process.env["CONTENT_KEY"] = cle.toString("hex");

    expect(modeContenu()).toBe("prod");
    const charge = chargerDefinition(NOM_TEMOIN);
    expect(charge.id).toBe(source.id);
    expect(charge.module).toBe(source.module);
  });
});
