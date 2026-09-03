import type { Primitive } from "@coop/shared";
import type { PuzzleDefinition } from "../content/types";
import type { ResultatObligations } from "../puzzles/obligations";

/**
 * Le rapport sans spoil de CLAUDE.md section 5.
 *
 * C'est le SEUL format dans lequel une salle reelle peut etre decrite au
 * proprietaire du depot. Rien de ce qui sort d'ici ne depend du contenu :
 * uniquement des primitives, des metriques et des resultats de tests.
 */

const NOM_PRIMITIVE: Record<Primitive, string> = {
  LEXIQUE: "lexique",
  TOPOLOGIE: "topologie",
  SIMULTANEITE: "simultaneite",
  ETAT_CROISE: "etat croise",
};

/**
 * Le point de friction attendu se deduit des primitives, pas du contenu.
 * C'est une propriete de la mecanique, donc dicible.
 */
const FRICTION: Record<Primitive, string> = {
  LEXIQUE: "nommer une forme qui n'a pas de nom",
  TOPOLOGIE: "decrire l'espace sans repere partage",
  SIMULTANEITE: "tout planifier avant de ne plus pouvoir se parler",
  ETAT_CROISE: "tenir un modele du systeme sans vue stable",
};

function etat(ok: boolean): string {
  return ok ? "OK" : "ECHEC";
}

export function rapportSansSpoil(
  definition: PuzzleDefinition,
  resultat: ResultatObligations,
): string {
  const primitives = definition.primitives
    .map((p) => NOM_PRIMITIVE[p] ?? p)
    .join(" + ");

  const friction = definition.primitives
    .map((p) => FRICTION[p])
    .filter(Boolean)
    .join(" ; ");

  const [min, max] = resultat.metriques.minutes;
  const m = resultat.metriques;

  return [
    `Salle ${definition.room} — mise a jour`,
    `Primitives                             : ${primitives}`,
    `Elements a transmettre (mediane / p95) : ${m.discreteElementsMediane} / ${m.discreteElementsP95}`,
    `Temps de resolution estime             : ${min}-${max} min`,
    `Allers-retours de communication        : ~${m.exchanges}`,
    `Point de friction anticipe             : ${friction}`,
    `Tests : solvabilite ${etat(resultat.solvabilite)} (${resultat.seedsTestes})` +
      ` · rejet ${etat(resultat.rejet)}` +
      ` · asymetrie ${etat(resultat.asymetrie)}` +
      ` · budget ${etat(resultat.budget)}`,
    `Resistance au hasard : ${resultat.victoiresFortuites} victoires fortuites` +
      ` sur ${resultat.seedsTestes * resultat.tiragesParSeed} marches`,
  ].join("\n");
}

/**
 * En cas d'echec : l'assertion et le seed, rien d'autre.
 * Le proprietaire rejoue le seed en mode dev s'il a besoin de voir.
 */
export function rapportDEchec(resultat: ResultatObligations): string {
  const apercu = resultat.echecs.slice(0, 10);
  const reste = resultat.echecs.length - apercu.length;
  return [
    `${resultat.echecs.length} assertion(s) en echec :`,
    ...apercu.map((ligne) => `  ${ligne}`),
    ...(reste > 0 ? [`  ... et ${reste} de plus`] : []),
  ].join("\n");
}
