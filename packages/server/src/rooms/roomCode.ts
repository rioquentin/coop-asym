import { randomInt } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@coop/shared";

/** Nombre de tirages avant d'abandonner. Voir le commentaire de collision. */
const MAX_ATTEMPTS = 32;

/** Un code au hasard, sans garantie d'unicite. */
export function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Tire un code libre.
 *
 * L'espace fait 23^4 = 279 841 codes. Avec le nombre de parties simultanees
 * vise (quelques unites), une collision est improbable et un seul retir la
 * resout. Les 32 essais sont la pour transformer un epuisement theorique en
 * erreur explicite plutot qu'en boucle infinie.
 */
export async function allocateRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomRoomCode();
    const taken = await matchMaker.query({ roomId: code });
    if (taken.length === 0) return code;
  }
  throw new Error(
    `Aucun code de room libre apres ${MAX_ATTEMPTS} tirages.`,
  );
}
