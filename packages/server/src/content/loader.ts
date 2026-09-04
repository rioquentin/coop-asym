import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { PuzzleDefinition } from "./types";

/**
 * Chargement du contenu. docs/architecture.md section 6.
 *
 *   dev  : content/dev/<nom>.json, en clair
 *   prod : content/prod/<nom>.enc, AES-256-GCM, cle dans CONTENT_KEY
 *
 * Le contenu de prod est dechiffre EN MEMOIRE et jamais reecrit sur disque.
 * Aucune erreur levee ici ne cite une valeur du contenu : un message
 * d'erreur bavard sur content/prod serait un spoil (CLAUDE.md section 1).
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOSSIER_DEV = join(RACINE, "content/dev");
const DOSSIER_PROD = join(RACINE, "content/prod");
const FICHIER_SCHEMA = join(RACINE, "schema/puzzle.schema.json");

const IV_OCTETS = 12;
const TAG_OCTETS = 16;
const CLE_OCTETS = 32;

export type ModeContenu = "dev" | "prod";

/**
 * Le mode de chargement.
 *
 * Un serveur lance en production SANS cle ne bascule pas silencieusement sur
 * le contenu de developpement : il refuse de demarrer. Servir la fixture
 * bidon a de vrais joueurs serait pire qu'un crash.
 */
export function modeContenu(): ModeContenu {
  if (process.env["NODE_ENV"] !== "production") return "dev";
  if (!process.env["CONTENT_KEY"]) {
    throw new Error(
      "NODE_ENV=production sans CONTENT_KEY : refus de servir du contenu de developpement.",
    );
  }
  return "prod";
}

/** La cle AES-256, lue dans CONTENT_KEY (64 caracteres hexadecimaux). */
export function cleContenu(): Buffer {
  const brut = process.env["CONTENT_KEY"];
  if (!brut) {
    throw new Error("CONTENT_KEY est absente.");
  }
  const cle = Buffer.from(brut.trim(), "hex");
  if (cle.length !== CLE_OCTETS) {
    throw new Error(
      `CONTENT_KEY doit faire ${CLE_OCTETS} octets en hexadecimal (${CLE_OCTETS * 2} caracteres).`,
    );
  }
  return cle;
}

/** Format du fichier chiffre : [iv 12][tag 16][chiffre]. */
export function chiffrer(clair: string, cle: Buffer): Buffer {
  const iv = randomBytes(IV_OCTETS);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const chiffre = Buffer.concat([
    chiffreur.update(clair, "utf8"),
    chiffreur.final(),
  ]);
  return Buffer.concat([iv, chiffreur.getAuthTag(), chiffre]);
}

export function dechiffrer(paquet: Buffer, cle: Buffer): string {
  if (paquet.length < IV_OCTETS + TAG_OCTETS) {
    throw new Error("Fichier de contenu chiffre tronque.");
  }
  const iv = paquet.subarray(0, IV_OCTETS);
  const tag = paquet.subarray(IV_OCTETS, IV_OCTETS + TAG_OCTETS);
  const chiffre = paquet.subarray(IV_OCTETS + TAG_OCTETS);
  const dechiffreur = createDecipheriv("aes-256-gcm", cle, iv);
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([
    dechiffreur.update(chiffre),
    dechiffreur.final(),
  ]).toString("utf8");
}

let validateur: ((donnees: unknown) => boolean) | undefined;
let erreursDuValidateur: (() => { instancePath: string; message?: string }[]) | undefined;

/**
 * Valide une definition contre schema/puzzle.schema.json.
 *
 * Exportee pour que les tests puissent verifier le refus sans avoir a poser
 * un fichier bancal dans content/.
 */
export function validerDefinition(definition: unknown, nom: string): void {
  if (!validateur) {
    const schema = JSON.parse(readFileSync(FICHIER_SCHEMA, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const compile = ajv.compile(schema);
    validateur = compile as (donnees: unknown) => boolean;
    erreursDuValidateur = () => compile.errors ?? [];
  }

  // SIMULTANEITE est restee dans le vocabulaire pour que l'erreur reste
  // lisible (docs/puzzle-spec.md section 2), pas pour qu'on la reprenne : elle
  // n'est pas realisable sous C2 avec un vocal externe. Une definition qui la
  // declare est refusee au chargement. Voir D73.
  const primitives = (definition as { primitives?: unknown }).primitives;
  if (Array.isArray(primitives) && primitives.includes("SIMULTANEITE")) {
    throw new Error(
      `Definition "${nom}" : SIMULTANEITE est une primitive retiree. ` +
        "Voir docs/puzzle-spec.md section 2.",
    );
  }

  if (validateur(definition)) return;

  // On ne rapporte QUE le chemin et le motif. Jamais la valeur fautive :
  // sur content/prod, ce serait un extrait du contenu reel.
  const details = (erreursDuValidateur?.() ?? [])
    .map((erreur) => `${erreur.instancePath || "/"} ${erreur.message ?? ""}`.trim())
    .join(" ; ");
  throw new Error(`Definition "${nom}" non conforme au schema : ${details}`);
}

const cache = new Map<string, PuzzleDefinition>();

/**
 * Charge une definition par son nom de fichier, sans extension.
 *
 * Le resultat est mis en cache : une definition est immuable pour la duree du
 * process. Le rechargement a chaud du contenu de dev n'est pas implemente.
 */
export function chargerDefinition(nom: string): PuzzleDefinition {
  const enCache = cache.get(nom);
  if (enCache) return enCache;

  const mode = modeContenu();
  const brut =
    mode === "dev"
      ? readFileSync(join(DOSSIER_DEV, `${nom}.json`), "utf8")
      : dechiffrer(
          readFileSync(join(DOSSIER_PROD, `${nom}.enc`)),
          cleContenu(),
        );

  const definition = JSON.parse(brut) as PuzzleDefinition;
  validerDefinition(definition, nom);

  cache.set(nom, definition);
  return definition;
}

/** Vide le cache. Pour les tests, qui font varier l'environnement. */
export function oublierDefinitions(): void {
  cache.clear();
}
