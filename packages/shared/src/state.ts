import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Etat PUBLIC d'une room, synchronise a tous les clients.
 *
 * Regle d'or (docs/architecture.md section 2) : cet etat ne contient que ce
 * qui est public. Aucune instance d'enigme, aucune vue de joueur, aucune
 * solution ne doit jamais entrer ici — tout ce qui est asymetrique part en
 * message cible via `client.send()`.
 */

export const PlayerState = schema(
  {
    /** "A" | "B". Vide tant que la room n'est pas passee en PLAYING. */
    role: t.string(),
    /** Faux pendant la fenetre de reconnexion. */
    connected: t.boolean(),
  },
  "Player",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    /** Le code a 4 lettres, egal au roomId. Affiche pour etre dicte a l'oral. */
    code: t.string(),
    /** WAITING | PLAYING | PAUSED | FINISHED. */
    phase: t.string(),
    /** Indexe par sessionId. */
    players: t.map(PlayerState),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
