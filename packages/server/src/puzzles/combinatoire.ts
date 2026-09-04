/**
 * Enumeration bornee.
 *
 * Sert a mesurer le RESIDU d'ambiguite : combien d'instances distinctes
 * restent compatibles avec une seule vue. Le residu vrai peut compter des
 * milliers d'elements ; on n'en enumere jamais plus que le plafond demande,
 * parce qu'un plancher se verifie avec un « au moins N », pas avec un compte
 * exact. Tout ce qui sort d'ici est donc une MINORATION, jamais une mesure.
 */

/**
 * Jusqu'a `plafond` permutations distinctes de `liste`, la liste elle-meme en
 * premier. Enumeration paresseuse : on s'arrete des que le plafond est
 * atteint, sans jamais construire les n! autres.
 */
export function permutations<T>(liste: T[], plafond: number): T[][] {
  const sorties: T[][] = [];
  if (plafond <= 0 || liste.length === 0) return sorties;

  const courant: T[] = [];
  const pris = new Array<boolean>(liste.length).fill(false);

  const descendre = (): void => {
    if (sorties.length >= plafond) return;
    if (courant.length === liste.length) {
      sorties.push([...courant]);
      return;
    }
    for (let i = 0; i < liste.length; i++) {
      if (pris[i]) continue;
      pris[i] = true;
      courant.push(liste[i] as T);
      descendre();
      courant.pop();
      pris[i] = false;
      if (sorties.length >= plafond) return;
    }
  };

  descendre();
  return sorties;
}

/**
 * Jusqu'a `plafond` arrangements distincts de `taille` elements pris dans
 * `liste`, ordre compris.
 */
export function arrangements<T>(
  liste: T[],
  taille: number,
  plafond: number,
): T[][] {
  const sorties: T[][] = [];
  if (plafond <= 0 || taille <= 0 || taille > liste.length) return sorties;

  const courant: T[] = [];
  const pris = new Array<boolean>(liste.length).fill(false);

  const descendre = (): void => {
    if (sorties.length >= plafond) return;
    if (courant.length === taille) {
      sorties.push([...courant]);
      return;
    }
    for (let i = 0; i < liste.length; i++) {
      if (pris[i]) continue;
      pris[i] = true;
      courant.push(liste[i] as T);
      descendre();
      courant.pop();
      pris[i] = false;
      if (sorties.length >= plafond) return;
    }
  };

  descendre();
  return sorties;
}

/**
 * Met en forme une reponse a `candidats` : l'instance de depart en tete, puis
 * les propositions qui donnent bien la meme vue, sans doublon, au plus
 * `plafond` en tout.
 *
 * Les quatre modules passent par ici pour que les trois garanties du contrat
 * — presence de l'instance, vue identique, deux a deux distinctes — soient
 * tenues au meme endroit plutot que reecrites quatre fois.
 */
export function classeDeVue<I>(
  instance: I,
  propositions: I[],
  memeVue: (candidat: I) => boolean,
  plafond: number,
): I[] {
  const vus = new Set<string>([JSON.stringify(instance)]);
  const sorties: I[] = [instance];

  for (const proposition of propositions) {
    if (sorties.length >= plafond) break;
    const empreinte = JSON.stringify(proposition);
    if (vus.has(empreinte)) continue;
    if (!memeVue(proposition)) continue;
    vus.add(empreinte);
    sorties.push(proposition);
  }

  return sorties.slice(0, plafond);
}
