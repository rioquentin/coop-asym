import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@coop/shared";
import { CHAINE_DES_SALLES } from "./content/chaine";
import { chargerDefinition } from "./content/loader";
import { chargerModule } from "./puzzles/registry";
import { GameRoom } from "./rooms/GameRoom";

/**
 * Construit le serveur de jeu sans l'ecouter.
 * Isole du bootstrap pour que les tests d'integration montent le meme serveur.
 */
export function createGameServer(): Server {
  // Une definition invalide doit tuer le demarrage, pas la premiere partie.
  for (const salle of CHAINE_DES_SALLES) {
    chargerModule(chargerDefinition(salle));
  }

  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
  });
  server.define(ROOM_NAME, GameRoom);
  return server;
}
