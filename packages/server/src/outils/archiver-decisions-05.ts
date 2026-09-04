import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiffrer, cleContenu } from "../content/loader";
import { chargerEnv, RACINE } from "./env";

/**
 * Range le raisonnement de la salle 5 dans content/prod, chiffre.
 *
 *   pnpm --filter @coop/server content:decisions-05
 *
 * Les decisions D59 a D62 decrivaient le retournement. Elles ont ete retirees
 * de DECISIONS.md quand le mur a ete elargi (CLAUDE.md section 1, D58). Ce
 * programme va les rechercher dans l'historique et les remet la ou vit le
 * reste du contenu reel.
 *
 * Il ne les affiche jamais. Il n'imprime qu'un nombre d'octets.
 */

chargerEnv();

if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente. Lance d'abord content:cle.");
  process.exit(1);
}

const REVISION = process.argv[2] ?? "HEAD";
const texte = execFileSync("git", ["show", `${REVISION}:DECISIONS.md`], {
  cwd: RACINE,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
});

const debut = texte.indexOf("### D59.");
const fin = texte.indexOf("### D63.");

if (debut < 0 || fin < 0 || fin <= debut) {
  console.error(
    `La revision ${REVISION} ne porte pas le bloc attendu.\n` +
      "Donne en argument une revision anterieure a l'elargissement du mur.",
  );
  process.exit(1);
}

const bloc =
  "# Decisions de la salle 5\n\n" +
  "Retirees de DECISIONS.md par D58 : les lire, c'est lire le retournement.\n" +
  `Extraites de ${REVISION}.\n\n` +
  texte.slice(debut, fin).trimEnd() +
  "\n";

const destination = join(RACINE, "content/prod/decisions-salle-05.enc");
const chiffre = chiffrer(bloc, cleContenu());
writeFileSync(destination, chiffre);

console.log(
  `content/prod/decisions-salle-05.enc ecrit (${chiffre.length} octets).\n` +
    "Son contenu n'a pas ete affiche et ne doit pas l'etre.",
);
