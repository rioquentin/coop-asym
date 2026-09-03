import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Racine du depot, vue depuis packages/server/src/outils/. */
export const RACINE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

export const FICHIER_ENV = join(RACINE, ".env");

/**
 * Verse le contenu de .env dans process.env, sans ecraser ce qui y est deja.
 *
 * .env est gitignore et contient CONTENT_KEY. Il n'est jamais affiche, jamais
 * journalise, jamais passe en argument de ligne de commande.
 */
export function chargerEnv(): void {
  if (!existsSync(FICHIER_ENV)) return;

  for (const ligne of readFileSync(FICHIER_ENV, "utf8").split(/\r?\n/)) {
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
