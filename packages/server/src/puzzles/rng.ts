/**
 * Generateur pseudo-aleatoire deterministe.
 *
 * `generate(seed)` doit rendre la meme instance pour le meme seed, sur
 * n'importe quelle machine et dans n'importe quel ordre d'appel — donc pas de
 * Math.random, et pas d'etat global.
 */

/** Hache une chaine en une graine 32 bits (xmur3). */
function graine(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [0, borne). */
  entier(borne: number): number;
}

/** Un generateur (mulberry32) amorce par la chaine `seed`. */
export function rngDepuis(seed: string): Rng {
  let etat = graine(seed);
  const next = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, entier: (borne) => Math.floor(next() * borne) };
}

/** Melange de Fisher-Yates. Ne modifie pas l'entree. */
export function melanger<T>(source: readonly T[], rng: Rng): T[] {
  const resultat = [...source];
  for (let i = resultat.length - 1; i > 0; i--) {
    const j = rng.entier(i + 1);
    const a = resultat[i] as T;
    const b = resultat[j] as T;
    resultat[i] = b;
    resultat[j] = a;
  }
  return resultat;
}

/** Decale un tableau d'un cran. Sert a fabriquer un voisin distinct. */
export function decaler<T>(source: readonly T[]): T[] {
  if (source.length < 2) return [...source];
  return [...source.slice(1), source[0] as T];
}
