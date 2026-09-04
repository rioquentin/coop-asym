import { CHAINE_DES_SALLES } from "../content/chaine";
import { chargerDefinition, oublierDefinitions } from "../content/loader";
import { seedsDeVerification, verifierObligations } from "../puzzles/obligations";
import { chargerModule } from "../puzzles/registry";
import { writeFileSync } from "node:fs";
import { chargerEnv } from "./env";
import { rapportSansSpoil } from "./rapport";

/**
 * Verdicts d'obligations sur la chaine chargee, et RIEN d'autre.
 *
 * Ce programme sait des nombres qu'il n'a pas le droit de dire : un residu est
 * une cardinalite, et une cardinalite se remonte au contenu. Il n'imprime donc
 * que des OK et des ECHEC. CLAUDE.md sections 1 et 5.
 */

if (!process.argv.includes("--dev")) chargerEnv();
if (process.env["CONTENT_KEY"]) process.env["NODE_ENV"] = "production";
oublierDefinitions();

const seeds = seedsDeVerification(500);
const etat = (ok: boolean): string => (ok ? "OK   " : "ECHEC");

/**
 * Ou ecrire le rapport, si on demande un fichier.
 *
 * Un rapport recopie a la main ne vaut rien : le destinataire ne peut rien
 * revérifier lui-meme, et la seule garantie qui lui reste est la bonne foi de
 * qui l'a tape. Il sort donc du harnais et va sur le disque tel quel, sans
 * repasser par une redaction. Voir D76.
 */
const drapeauFichier = process.argv.indexOf("--fichier");
const fichier = drapeauFichier < 0 ? null : process.argv[drapeauFichier + 1];
const lignes: string[] = [];
const dire = (texte: string): void => {
  lignes.push(texte);
  if (!fichier) console.log(texte);
};

for (const nom of CHAINE_DES_SALLES) {
  const definition = chargerDefinition(nom);
  const r = verifierObligations(chargerModule(definition), definition, seeds);
  if (process.argv.includes("--rapport")) {
    dire(rapportSansSpoil(definition, r));
    dire("");
    continue;
  }
  dire(
    `salle ${definition.room} : solvabilite ${etat(r.solvabilite)} rejet ${etat(r.rejet)} ` +
      `asymetrie ${etat(r.asymetrie)} budget ${etat(r.budget)} residu ${etat(r.residu)} ` +
      `| residu cote A ${etat(!r.echecs.some((e) => e.startsWith("[residu/A]")))} ` +
      `cote B ${etat(!r.echecs.some((e) => e.startsWith("[residu/B]")))} ` +
      `| oracles : ${r.rolesQuiSondent.join(",") || "aucun"}`,
  );
}

if (fichier) {
  writeFileSync(fichier, lignes.join("\n"), "utf8");
  console.log(`Rapport ecrit dans ${fichier}.`);
}
