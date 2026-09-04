import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  chargerEnv,
  dansUnDossierSynchronise,
  fichierEnv,
  FICHIER_ENV_HORS_DEPOT,
} from "./env";

/**
 * Genere une CONTENT_KEY et l'ecrit HORS du depot.
 *
 *   pnpm --filter @coop/server content:cle
 *
 * La cle n'est jamais affichee : elle ne doit exister que dans ce fichier et
 * dans les variables d'environnement du serveur de production. Une cle qui
 * passe par un terminal finit dans un historique.
 *
 * Elle est ecrite dans ~/.coop-asym/.env et pas dans le depot : un depot pose
 * dans un dossier synchronise emporte tout ce qu'il contient. La cle a cote du
 * contenu chiffre, c'est le clair chez le fournisseur.
 */

chargerEnv();

if (process.env["CONTENT_KEY"]) {
  const ou = fichierEnv();
  const lignes = [
    "Une CONTENT_KEY existe deja. Elle n'a pas ete touchee :",
    "la remplacer rendrait illisible tout content/prod deja chiffre.",
  ];
  if (ou) lignes.push(`Elle est lue depuis ${ou}.`);
  if (ou && dansUnDossierSynchronise(ou)) {
    lignes.push(
      `DEPLACE-LA vers ${FICHIER_ENV_HORS_DEPOT} : ce dossier est synchronise.`,
    );
  }
  lignes.push("Pour repartir de zero, retire la ligne toi-meme.");
  console.log(lignes.join("\n"));
  process.exit(0);
}

const cle = randomBytes(32).toString("hex");
mkdirSync(dirname(FICHIER_ENV_HORS_DEPOT), { recursive: true });

const ancien = existsSync(FICHIER_ENV_HORS_DEPOT)
  ? readFileSync(FICHIER_ENV_HORS_DEPOT, "utf8")
  : "";
const separateur = ancien.length > 0 && !ancien.endsWith("\n") ? "\n" : "";

writeFileSync(
  FICHIER_ENV_HORS_DEPOT,
  `${ancien}${separateur}CONTENT_KEY=${cle}\n`,
  "utf8",
);

console.log(
  [
    `CONTENT_KEY ecrite dans ${FICHIER_ENV_HORS_DEPOT} (32 octets).`,
    "Hors du depot, volontairement : un dossier synchronise emporterait la cle",
    "avec le contenu qu'elle ouvre.",
    "Sauvegarde ce fichier ailleurs : sans lui, content/prod est perdu.",
  ].join("\n"),
);
