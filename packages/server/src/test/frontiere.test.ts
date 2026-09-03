import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou d'architecture, pas de comportement.
 *
 * CLAUDE.md section 3 : la logique de resolution vit cote serveur uniquement,
 * et rien de `content/prod` ne doit atteindre le bundle client. Le moyen le
 * plus sur d'y arriver n'est pas de surveiller le bundle apres coup, c'est
 * qu'aucun chemin d'import ne mene du client au serveur.
 */

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Tous les fichiers source sous un dossier. */
function sources(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...sources(chemin));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entree)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Les specificateurs de module importes par un fichier. */
function imports(chemin: string): string[] {
  const source = readFileSync(chemin, "utf8");
  const specificateurs: string[] = [];
  const motif = /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = motif.exec(source)) !== null) {
    const specificateur = trouve[1] ?? trouve[2];
    if (specificateur) specificateurs.push(specificateur);
  }
  return specificateurs;
}

/**
 * Ce qu'un module importe par le client ne doit jamais toucher.
 *
 * Le moteur d'enigmes (`solve`, `ambiguites`, `actionsPossibles`) et le
 * loader de contenu vivent tous sous ces chemins.
 */
const INTERDITS = [
  "@coop/server",
  "content/prod",
  "content/loader",
  "/puzzles/",
  "../server",
];

describe("frontiere client / serveur", () => {
  const fichiersClient = sources(join(racine, "packages/client/src"));
  const fichiersPartages = sources(join(racine, "packages/shared/src"));

  it("trouve bien les sources a inspecter", () => {
    expect(fichiersClient.length).toBeGreaterThan(0);
    expect(fichiersPartages.length).toBeGreaterThan(0);
  });

  it("le client ne declare aucune dependance vers le serveur", () => {
    const manifeste = JSON.parse(
      readFileSync(join(racine, "packages/client/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(manifeste.dependencies ?? {})).not.toContain(
      "@coop/server",
    );
  });

  it("aucune source client n'importe le serveur ni content/prod", () => {
    for (const fichier of fichiersClient) {
      for (const specificateur of imports(fichier)) {
        for (const interdit of INTERDITS) {
          expect(
            specificateur.includes(interdit),
            `${fichier} importe ${specificateur}`,
          ).toBe(false);
        }
      }
    }
  });

  it("aucune source client ne sort de son paquet", () => {
    // Un import qui remonte au-dessus de packages/client atteint le serveur
    // par un autre chemin que son nom. Personne ne le voit venir en revue.
    for (const fichier of fichiersClient) {
      for (const specificateur of imports(fichier)) {
        expect(
          specificateur.startsWith("../../"),
          `${fichier} remonte hors du paquet : ${specificateur}`,
        ).toBe(false);
      }
    }
  });

  it("le paquet partage reste importable par le client", () => {
    // shared est le seul pont : s'il tirait le serveur, tout le mur tomberait.
    for (const fichier of fichiersPartages) {
      for (const specificateur of imports(fichier)) {
        for (const interdit of INTERDITS) {
          expect(
            specificateur.includes(interdit),
            `${fichier} importe ${specificateur}`,
          ).toBe(false);
        }
      }
    }
  });
});
