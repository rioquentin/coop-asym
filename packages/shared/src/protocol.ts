/**
 * Protocole client <-> serveur. Voir docs/architecture.md section 5.
 *
 * Regle d'or : le client envoie des INTENTIONS, jamais des resultats.
 * Il n'existe volontairement aucun message `solved` cote client.
 */

// Le protocole transporte vues et actions sans jamais les interpreter.
import type { Action, View } from "./puzzle";

/** Role d'un joueur. Attribue a l'entree en PLAYING, fige ensuite. */
export type Role = "A" | "B";

/** Cycle de vie d'une room. Voir docs/architecture.md section 3. */
export type RoomPhase = "WAITING" | "PLAYING" | "PAUSED" | "FINISHED";

/**
 * Duree de vie des rooms sans joueur utile, en millisecondes.
 * PLAYING n'a pas de TTL : une partie en cours n'est jamais balayee.
 */
export const ROOM_TTL_MS: Record<Exclude<RoomPhase, "PLAYING">, number> = {
  WAITING: 15 * 60_000,
  PAUSED: 5 * 60_000,
  FINISHED: 2 * 60_000,
};

/** Fenetre de reconnexion, en secondes. Alignee sur ROOM_TTL_MS.PAUSED. */
export const RECONNECTION_WINDOW_SECONDS = ROOM_TTL_MS.PAUSED / 1000;

export type ClientMessage =
  | { t: "action"; puzzleId: string; action: Action }
  | { t: "chat"; text: string }
  | { t: "ready" }
  | { t: "ping" };

export type ServerMessage =
  | { t: "view"; puzzleId: string; role: Role; view: View }
  | { t: "feedback"; kind: "accepted" | "rejected"; hint?: string }
  | {
      t: "roomAdvance";
      room: number;
      /** Habillage de la salle. Absent tant qu'elle n'en a pas. */
      label?: string;
      ambient?: string;
    }
  | { t: "partner"; status: "connected" | "disconnected" }
  | { t: "chat"; from: Role; text: string }
  | { t: "finished" };

/** Cle de message Colyseus pour les messages serveur -> client. */
export const SERVER_MESSAGE = "s";
/** Cle de message Colyseus pour les messages client -> serveur. */
export const CLIENT_MESSAGE = "c";
