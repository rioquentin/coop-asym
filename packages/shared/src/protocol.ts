/**
 * Protocole client <-> serveur. Voir docs/architecture.md section 5.
 *
 * Regle d'or : le client envoie des INTENTIONS, jamais des resultats.
 * Il n'existe volontairement aucun message `solved` cote client.
 */

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

/** Identifiant de l'enigme bidon du jalon 2. */
export const DEMO_PUZZLE_ID = "demo-loop";

/**
 * Vues de l'enigme bidon. Elles disent tout du principe du jeu :
 * A ne voit qu'un bouton, B ne voit qu'une lampe. La vue de A ne contient
 * RIEN qui permette de deduire l'etat de la lampe — pas meme un compteur de
 * pressions, dont la parite suffirait.
 */
export type DemoView =
  | { kind: "button" }
  | { kind: "light"; lit: boolean };

/** Intentions de l'enigme bidon. `press` est a A, `confirm` est a B. */
export type DemoAction = { type: "press" } | { type: "confirm" };

/**
 * Action et View sont pour l'instant celles de l'enigme bidon.
 * Le moteur du jalon 3 les elargira aux vrais PuzzleModule
 * (CLAUDE.md section 3).
 */
export type Action = DemoAction;
export type View = DemoView;

export type ClientMessage =
  | { t: "action"; puzzleId: string; action: Action }
  | { t: "chat"; text: string }
  | { t: "ready" }
  | { t: "ping" };

export type ServerMessage =
  | { t: "view"; puzzleId: string; role: Role; view: View }
  | { t: "feedback"; kind: "accepted" | "rejected"; hint?: string }
  | { t: "roomAdvance"; room: number }
  | { t: "partner"; status: "connected" | "disconnected" }
  | { t: "chat"; from: Role; text: string }
  | { t: "finished" };

/** Cle de message Colyseus pour les messages serveur -> client. */
export const SERVER_MESSAGE = "s";
/** Cle de message Colyseus pour les messages client -> serveur. */
export const CLIENT_MESSAGE = "c";
