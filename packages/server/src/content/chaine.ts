/**
 * La chaine des salles, dans l'ordre. v1 : 5 salles, lineaire, pas de hub
 * (CLAUDE.md section 6).
 *
 * Les noms sont des noms de FICHIER sans extension : content/dev/<nom>.json
 * en developpement, content/prod/<nom>.enc en production.
 *
 * Un meme nom logique designe les deux versions d'une salle : la fixture
 * lisible en developpement, le contenu reel chiffre en production. Le loader
 * choisit selon le mode, personne d'autre n'a a le savoir.
 *
 * Le passage d'une salle a la suivante (message `roomAdvance`) arrive avec la
 * salle 2.
 */
export const CHAINE_DES_SALLES = ["room-01", "room-02", "room-03", "room-04"] as const;
