import type { Server } from "@colyseus/core";
import { createGameServer } from "../server";

/** Attend qu'une condition portee par l'etat synchronise devienne vraie. */
export async function until(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition jamais atteinte");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Laisse passer un aller-retour reseau quand il n'y a rien a attendre. */
export async function respirer(ms = 120): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function demarrerServeur(port: number): Promise<Server> {
  const server = createGameServer();
  await server.listen(port);
  return server;
}

/**
 * Absorbe les messages de jeu d'une room.
 *
 * Les tests qui ne s'interessent qu'au lobby recoivent quand meme les vues :
 * sans gestionnaire, le SDK les signale a chaque fois. Le joker `"*"` n'est
 * appele que s'il n'existe aucun gestionnaire specifique, donc il suffit.
 */
export function ignorerMessages(room: { onMessage: Function }): void {
  room.onMessage("*", () => {});
}
