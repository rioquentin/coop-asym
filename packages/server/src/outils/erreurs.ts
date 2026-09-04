import { logger } from "@colyseus/core";

/**
 * Ce qu'on a le droit de dire d'une erreur.
 *
 * Une exception levee au milieu d'une partie tient l'instance dans sa portee.
 * Il suffit d'un message construit par interpolation, d'un `JSON.stringify`
 * dans un journal, d'un objet passe tel quel a un client, et une solution
 * traverse le mur — vers l'ecran d'un joueur, ou vers un journal que le
 * proprietaire du depot lira.
 *
 * En production, on ne laisse donc sortir que la CLASSE de l'erreur et
 * l'endroit ou elle s'est produite. Ni le message, ni la pile, ni rien qui
 * ait pu etre interpole. En developpement, tout sort : le contenu y est
 * bidon, et un debogage aveugle ne sert personne.
 */

function enProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/** Une ligne de journal qui ne peut rien porter du contenu. */
export function sansEtat(ou: string, erreur: unknown): string {
  if (!enProduction()) {
    return `[${ou}] ${erreur instanceof Error ? erreur.stack : String(erreur)}`;
  }
  const classe = erreur instanceof Error ? erreur.name : typeof erreur;
  return `[${ou}] ${classe} (message et pile tus : NODE_ENV=production)`;
}

/**
 * Execute `action` en refusant qu'une exception quitte le serveur.
 *
 * Le client recoit `secours` — une valeur ecrite ici, jamais derivee de
 * l'erreur. C'est ce qui garantit qu'aucune donnee d'instance ne peut
 * remonter par ce chemin.
 */
export function garde<T>(ou: string, action: () => T, secours: T): T {
  try {
    return action();
  } catch (erreur) {
    logger.error(sansEtat(ou, erreur));
    return secours;
  }
}

/**
 * Filet du processus. Une exception non rattrapee ne doit pas imprimer une
 * instance dans les journaux de l'hebergeur.
 */
export function protegerLeProcessus(): void {
  process.on("uncaughtException", (erreur) => {
    logger.error(sansEtat("uncaughtException", erreur));
  });
  process.on("unhandledRejection", (raison) => {
    logger.error(sansEtat("unhandledRejection", raison));
  });
}
