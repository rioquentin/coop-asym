import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chargerEnv, FICHIER_ENV } from "./env";

/**
 * Genere une CONTENT_KEY et l'ecrit dans .env, qui est gitignore.
 *
 * La cle n'est jamais affichee : elle ne doit exister que dans ce fichier et
 * dans les variables d'environnement du serveur de production. Une cle qui
 * passe par un terminal finit dans un historique.
 *
 *   pnpm --filter @coop/server content:cle
 */

chargerEnv();

if (process.env["CONTENT_KEY"]) {
  console.log(
    "Une CONTENT_KEY existe deja. Elle n'a pas ete touchee :\n" +
      "la remplacer rendrait illisible tout content/prod deja chiffre.\n" +
      "Pour repartir de zero, retire la ligne de .env toi-meme.",
  );
  process.exit(0);
}

const cle = randomBytes(32).toString("hex");
const ancien = existsSync(FICHIER_ENV) ? readFileSync(FICHIER_ENV, "utf8") : "";
const separateur = ancien.length > 0 && !ancien.endsWith("\n") ? "\n" : "";

writeFileSync(FICHIER_ENV, `${ancien}${separateur}CONTENT_KEY=${cle}\n`, "utf8");

console.log(
  `CONTENT_KEY ecrite dans ${FICHIER_ENV} (32 octets).\n` +
    "Ce fichier est gitignore. Sauvegarde-le hors du depot : sans lui,\n" +
    "content/prod devient definitivement illisible.",
);
