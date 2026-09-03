import { chargerDefinition, oublierDefinitions } from "../content/loader";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { chargerEnv } from "./env";
import { rapportDEchec, rapportSansSpoil } from "./rapport";

/**
 * Refait passer les quatre obligations a une salle deja ecrite, et n'en dit
 * que le rapport sans spoil.
 *
 *   pnpm --filter @coop/server content:verifier room-01
 *
 * Sert apres tout changement du moteur : le contenu de production ne peut pas
 * etre relu a la main, donc c'est le seul moyen de savoir qu'il tient encore.
 */

const nom = process.argv[2];
if (!nom) {
  console.error("Usage : content:verifier <nom-de-salle>");
  process.exit(1);
}

chargerEnv();

// Sans NODE_ENV=production, le loader lit content/dev. C'est le comportement
// voulu : on verifie ce que le mode courant sert reellement.
if (process.env["CONTENT_KEY"] && !process.env["NODE_ENV"]) {
  process.env["NODE_ENV"] = "production";
}

oublierDefinitions();

const definition = chargerDefinition(nom);
const enigme = chargerModule(definition);
const resultat = verifierObligations(enigme, definition, seedsDeVerification(500));

console.log(rapportSansSpoil(definition, resultat));

if (
  !resultat.solvabilite ||
  !resultat.rejet ||
  !resultat.asymetrie ||
  !resultat.budget
) {
  console.error(`\n${rapportDEchec(resultat)}`);
  process.exit(1);
}
