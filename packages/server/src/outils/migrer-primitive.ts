import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffrer, cleContenu, dechiffrer, validerDefinition } from "../content/loader";
import type { PuzzleDefinition } from "../content/types";
import { chargerEnv, RACINE } from "./env";

/**
 * Renomme une primitive dans les definitions chiffrees de content/prod.
 *
 *   pnpm --filter @coop/server content:migrer-primitive SIMULTANEITE ETAT_CROISE
 *
 * Une definition de production n'est pas re-generable sans perdre l'habillage
 * qu'on a pose dessus. Quand seul un champ de vocabulaire change, on le change
 * sur place : dechiffrer, corriger UN champ, rechiffrer. Le reste de la
 * definition n'est ni lu, ni affiche, ni touche.
 */

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

const [avant, apres] = process.argv.slice(2);
if (!avant || !apres) {
  console.error("Usage : content:migrer-primitive <ANCIENNE> <NOUVELLE>");
  process.exit(1);
}

const cle = cleContenu();
let touchees = 0;

for (const nom of ["room-01", "room-02", "room-03", "room-04", "room-05"]) {
  const chemin = join(RACINE, `content/prod/${nom}.enc`);
  const definition = JSON.parse(
    dechiffrer(readFileSync(chemin), cle),
  ) as PuzzleDefinition;

  if (!definition.primitives.includes(avant as never)) continue;

  definition.primitives = definition.primitives.map((p) =>
    p === avant ? (apres as never) : p,
  );
  validerDefinition(definition, nom);
  writeFileSync(chemin, chiffrer(JSON.stringify(definition), cle));
  touchees++;
  // On dit le fichier, jamais son contenu.
  console.log(`${nom} : primitive renommee.`);
}

console.log(`${touchees} definition(s) touchee(s).`);
