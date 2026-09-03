/**
 * La chaine des salles, dans l'ordre. v1 : 5 salles, lineaire, pas de hub
 * (CLAUDE.md section 6).
 *
 * Les noms sont des noms de FICHIER sans extension : content/dev/<nom>.json
 * en developpement, content/prod/<nom>.enc en production.
 *
 * Au jalon 3 la chaine ne compte qu'une entree, la fixture de developpement.
 * Le passage d'une salle a la suivante (message `roomAdvance`) arrive avec la
 * salle 2.
 */
export const CHAINE_DES_SALLES = ["room-01-fixture"] as const;
