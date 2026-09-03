/**
 * Composition des glyphes.
 *
 * Un glyphe n'est pas un dessin arbitraire : c'est un SOCLE plus une ou deux
 * MARQUES, prises dans un petit vocabulaire de formes. C'est une contrainte de
 * jouabilite, pas de style.
 *
 * docs/puzzle-spec.md section 6 rejette « le glyphe indescriptible : un
 * symbole que personne ne peut nommer sans faire un dessin ». Des traces
 * tires au hasard tomberaient exactement dedans. Compose, un glyphe se dit en
 * une phrase — « la boucle avec la barre du haut » — ce qui est precisement
 * le geste que le jeu demande au duo.
 *
 * Ce fichier est de la MECANIQUE : il ne contient aucun contenu de partie.
 * Quels socles et quelles marques composent la salle 1 est tire par
 * src/outils/generer-salle.ts et vit chiffre dans content/prod.
 */

/** Boite de dessin. Le client rend le trace dans ce repere. */
export const BOITE_GLYPHE = 100;

/**
 * Les socles. Chacun est reconnaissable a distance et nommable sans effort.
 */
export const SOCLES: Record<string, string> = {
  hampe: "M50 14 L50 86",
  arc: "M24 80 Q50 12 76 80",
  boucle: "M50 26 C26 26 26 74 50 74 C74 74 74 26 50 26",
  chevron: "M26 32 L50 74 L74 32",
  croisillon: "M26 26 L74 74 M74 26 L26 74",
  equerre: "M28 20 L28 80 L76 80",
};

/**
 * Les marques. Elles se posent aux bords de la boite pour rester lisibles
 * quel que soit le socle.
 */
export const MARQUES: Record<string, string> = {
  "barre-haute": "M30 18 L70 18",
  "barre-basse": "M30 88 L70 88",
  "point-gauche": "M14 50 A 3 3 0 1 0 20 50 A 3 3 0 1 0 14 50",
  "point-droit": "M80 50 A 3 3 0 1 0 86 50 A 3 3 0 1 0 80 50",
  crochet: "M78 74 Q90 74 90 60",
  queue: "M50 86 Q50 96 64 96",
};

export const NOMS_SOCLES = Object.keys(SOCLES);
export const NOMS_MARQUES = Object.keys(MARQUES);

/** Un glyphe, tel qu'il est decrit dans une definition de contenu. */
export interface CompositionGlyphe {
  socle: string;
  marques: string[];
}

/** Nombre maximum de marques par glyphe. Au-dela, le glyphe devient un dessin. */
export const MARQUES_MAX = 2;

/**
 * Rend la composition en un trace SVG unique.
 * Les segments sont simplement concatenes : socle d'abord, marques ensuite.
 */
export function tracerGlyphe(composition: CompositionGlyphe): string {
  const socle = SOCLES[composition.socle];
  if (!socle) {
    throw new Error(`Socle de glyphe inconnu : "${composition.socle}"`);
  }
  if (composition.marques.length > MARQUES_MAX) {
    throw new Error(
      `Un glyphe porte au plus ${MARQUES_MAX} marques, celui-ci en porte ${composition.marques.length}.`,
    );
  }

  const traces = [socle];
  for (const nom of composition.marques) {
    const marque = MARQUES[nom];
    if (!marque) throw new Error(`Marque de glyphe inconnue : "${nom}"`);
    traces.push(marque);
  }
  return traces.join(" ");
}

/**
 * Deux glyphes sont-ils trop proches pour etre distingues a l'oral ?
 *
 * Meme socle et memes marques a une pres : le duo passerait son temps a
 * lever l'ambiguite au lieu de jouer. Sert de garde-fou au tirage d'une salle.
 */
export function tropProches(
  a: CompositionGlyphe,
  b: CompositionGlyphe,
): boolean {
  if (a.socle !== b.socle) return false;
  const communes = a.marques.filter((m) => b.marques.includes(m)).length;
  const total = Math.max(a.marques.length, b.marques.length);
  return total - communes <= 1;
}
