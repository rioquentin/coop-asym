/**
 * Code de room : 4 lettres, dicte a l'oral sur Discord.
 *
 * L'alphabet exclut I, O et L : a l'oral comme a l'ecran ils se confondent
 * avec 1 et 0. Pas de chiffres du tout, pour la meme raison.
 * Voir docs/architecture.md section 3.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;

/** Nom d'enregistrement de la room cote Colyseus. */
export const ROOM_NAME = "game";

const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

/**
 * Met un code saisi par un joueur sous sa forme canonique.
 * Tolere la casse et les espaces : le code est dicte a l'oral, pas copie-colle.
 */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Vrai si la chaine est deja un code canonique valide. */
export function isRoomCode(input: string): boolean {
  return ROOM_CODE_PATTERN.test(input);
}
