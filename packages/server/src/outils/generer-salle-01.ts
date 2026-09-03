import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffrer, cleContenu, validerDefinition } from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import {
  NOMS_MARQUES,
  NOMS_SOCLES,
  tropProches,
  type CompositionGlyphe,
} from "../puzzles/lexicon/glyphes";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { melanger, rngDepuis, type Rng } from "../puzzles/rng";
import { chargerEnv, RACINE } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Tire la salle 1 et l'ecrit chiffree dans content/prod.
 *
 *   pnpm --filter @coop/server content:salle-01
 *
 * Le tirage vient de crypto.randomBytes, au moment de l'execution. Le contenu
 * n'existe en clair que dans la memoire de ce process : il est chiffre avant
 * d'atteindre le disque, et rien de ce qui est affiche ne le decrit.
 * CLAUDE.md sections 1, 2 et 5.
 *
 * Ce que ce fichier dit de la salle 1 est PUBLIC, parce que c'est le cahier
 * des charges, pas le contenu : primitive LEXIQUE seule, correspondance 1:1,
 * 6 a 7 glyphes, 2 a 4 minutes.
 */

const NOM = "room-01";
const DOSSIER_PROD = join(RACINE, "content/prod");
const SEEDS = seedsDeVerification(500);

/**
 * Vocabulaire autorise par docs/world-bible.md section 4.
 * Liste publique ; quels mots sont retenus et a quel glyphe ils vont, non.
 */
const VOCABULAIRE = [
  "registre",
  "index",
  "cote",
  "relevé",
  "transcription",
  "observance",
  "litanie",
  "cloître",
  "dépôt",
  "vigile",
  "préposé",
  "mention",
  "expurgé",
  "conforme",
  "versement",
];

/**
 * Tire des glyphes deux a deux distinguables a l'oral.
 *
 * Salle 1 est la plus facile de la chaine : on epuise les socles avant d'en
 * reutiliser un, pour que la distinction se voie au premier coup d'oeil.
 */
function tirerGlyphes(rng: Rng, nombre: number): CompositionGlyphe[] {
  for (let essai = 0; essai < 500; essai++) {
    const socles = melanger(NOMS_SOCLES, rng);
    const compositions: CompositionGlyphe[] = [];

    for (let i = 0; i < nombre; i++) {
      const marques = melanger(NOMS_MARQUES, rng).slice(0, rng.entier(3));
      compositions.push({
        socle: socles[i % socles.length] as string,
        marques: marques.sort(),
      });
    }

    const distinguables = compositions.every((a, i) =>
      compositions.every((b, j) => i === j || !tropProches(a, b)),
    );
    if (distinguables) return compositions;
  }
  throw new Error(
    "Impossible de tirer un jeu de glyphes distinguables. Elargis le vocabulaire de formes.",
  );
}

function construireDefinition(): PuzzleDefinition {
  const rng = rngDepuis(randomBytes(16).toString("hex"));
  const nombre = 6 + rng.entier(2);

  const identifiants = Array.from({ length: nombre }, (_, i) => `g${i + 1}`);
  const compositions = tirerGlyphes(rng, nombre);
  const sens = melanger(VOCABULAIRE, rng).slice(0, nombre);

  const traces: Record<string, CompositionGlyphe> = {};
  const legend: Record<string, string> = {};
  identifiants.forEach((id, i) => {
    traces[id] = compositions[i] as CompositionGlyphe;
    legend[id] = sens[i] as string;
  });

  return {
    id: "salle-01",
    room: 1,
    primitives: ["LEXIQUE"],
    module: "src/puzzles/lexicon/index.ts",
    roles: {
      A: { component: "GlyphGrid", canAct: true, sees: ["glyphs", "slots"] },
      B: { component: "LegendPanel", canAct: true, sees: ["legend", "targetOrder"] },
    },
    budget: {
      maxDiscreteElements: 7,
      targetExchanges: nombre + 1,
      targetMinutes: [2, 4],
    },
    failure: { costSeconds: 0.5, resetsPuzzle: false, feedback: "informative" },
    content: {
      glyphs: identifiants,
      legend,
      slots: nombre,
      targetOrder: melanger(identifiants, rng),
      traces,
    },
  };
}

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error(
    "CONTENT_KEY absente. Lance d'abord :\n" +
      "  pnpm --filter @coop/server content:cle",
  );
  process.exit(1);
}

const destination = join(DOSSIER_PROD, `${NOM}.enc`);
if (existsSync(destination) && !process.argv.includes("--remplacer")) {
  console.error(
    `${destination} existe deja. Le remplacer detruirait la salle en place.\n` +
      "Ajoute --remplacer si c'est bien ce que tu veux.",
  );
  process.exit(1);
}

const definition = construireDefinition();
validerDefinition(definition, NOM);

const enigme = chargerModule(definition);
const resultat = verifierObligations(enigme, definition, SEEDS);

if (
  !resultat.solvabilite ||
  !resultat.rejet ||
  !resultat.asymetrie ||
  !resultat.budget
) {
  // Rien n'est ecrit : une salle qui ne passe pas ses obligations n'existe pas.
  console.error(rapportDEchec(resultat));
  process.exit(1);
}

mkdirSync(DOSSIER_PROD, { recursive: true });
writeFileSync(destination, chiffrer(JSON.stringify(definition), cleContenu()));

console.log(rapportSansSpoil(definition, resultat));
