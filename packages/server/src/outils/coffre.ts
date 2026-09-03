import { randomBytes } from "node:crypto";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";

/**
 * Effacement d'un fichier clair.
 *
 * Ecrase le contenu par du bruit avant de delier, pour qu'un clair de passage
 * ne trainne pas dans l'espace libre du disque. Ce n'est pas de la securite —
 * un journal de systeme de fichiers peut en garder trace — c'est le meme
 * garde-fou que le chiffrement de content/prod : rendre l'ouverture
 * accidentelle impossible.
 */
export function effacerFichier(chemin: string): void {
  if (!existsSync(chemin)) return;
  const taille = statSync(chemin).size;
  if (taille > 0) writeFileSync(chemin, randomBytes(taille));
  unlinkSync(chemin);
}
