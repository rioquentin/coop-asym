import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@coop/shared";
import { GameRoom } from "./rooms/GameRoom";

/**
 * Construit le serveur de jeu sans l'ecouter.
 * Isole du bootstrap pour que les tests d'integration montent le meme serveur.
 */
export function createGameServer(): Server {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
  });
  server.define(ROOM_NAME, GameRoom);
  return server;
}
