import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Racine du depot, vue depuis packages/server/src/outils/. */
export const RACINE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/**
 * Ou vit CONTENT_KEY.
 *
 * **Hors du depot par defaut.** Un depot pose dans un dossier synchronise —
 * OneDrive, Dropbox, iCloud — y emporte tout ce qu'il contient, versions
 * anterieures comprises. Y laisser la cle a cote du contenu chiffre revient a
 * y avoir depose le clair : le fournisseur detient les deux moities.
 *
 * Ordre de recherche :
 *   1. la variable d'environnement, qui prime toujours (production) ;
 *   2. le chemin donne par COOP_ENV_FILE ;
 *   3. ~/.coop-asym/.env ;
 *   4. <depot>/.env — accepte, mais signale.
 */
export const FICHIER_ENV_HORS_DEPOT = join(homedir(), ".coop-asym", ".env");
const FICHIER_ENV_DEPOT = join(RACINE, ".env");

/** Le fichier qui sera lu, ou undefined si aucun n'existe. */
export function fichierEnv(): string | undefined {
  const choisi = process.env["COOP_ENV_FILE"];
  if (choisi && existsSync(choisi)) return choisi;
  if (existsSync(FICHIER_ENV_HORS_DEPOT)) return FICHIER_ENV_HORS_DEPOT;
  if (existsSync(FICHIER_ENV_DEPOT)) return FICHIER_ENV_DEPOT;
  return undefined;
}

/** Vrai si le chemin est sous un dossier connu pour se synchroniser. */
export function dansUnDossierSynchronise(chemin: string): boolean {
  return /[\\/](OneDrive|Dropbox|iCloudDrive|Google ?Drive)[\\/]/i.test(chemin);
}

/**
 * Verse le contenu du fichier d'environnement dans process.env, sans ecraser
 * ce qui y est deja.
 *
 * Il n'est jamais affiche, jamais journalise, jamais passe en argument de
 * ligne de commande.
 */
export function chargerEnv(): void {
  const fichier = fichierEnv();
  if (!fichier) return;

  if (dansUnDossierSynchronise(fichier)) {
    console.warn(
      `ATTENTION : ${fichier} est dans un dossier synchronise.\n` +
        "La cle part chez un tiers, avec le contenu chiffre qu'elle ouvre.\n" +
        `Deplace-la vers ${FICHIER_ENV_HORS_DEPOT} ou pointe COOP_ENV_FILE ailleurs.`,
    );
  }

  for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const nette = ligne.trim();
    if (!nette || nette.startsWith("#")) continue;

    const separateur = nette.indexOf("=");
    if (separateur <= 0) continue;

    const cle = nette.slice(0, separateur).trim();
    if (process.env[cle] !== undefined) continue;

    process.env[cle] = nette
      .slice(separateur + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}
