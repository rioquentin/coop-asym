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

/**
 * Une ligne de chat.
 *
 * Le chat est PUBLIC au sens du jeu : les deux joueurs voient les memes
 * lignes. Il a donc sa place dans l'etat synchronise, comme le prevoit
 * docs/architecture.md section 2 — et il survit de ce fait a une reconnexion
 * sans code supplementaire.
 */
export const ChatEntry = schema(
  {
    /** "A" | "B". Le serveur le pose, jamais le client. */
    from: t.string(),
    text: t.string(),
  },
  "ChatEntry",
);
export type ChatEntry = SchemaType<typeof ChatEntry>;

/** Lignes conservees. Au-dela, les plus anciennes tombent. */
export const CHAT_MAX_LIGNES = 200;
/** Longueur maximale d'une ligne, en caracteres. */
export const CHAT_MAX_CARACTERES = 200;

export const GameState = schema(
  {
    /** Le code a 4 lettres, egal au roomId. Affiche pour etre dicte a l'oral. */
    code: t.string(),
    /** WAITING | PLAYING | PAUSED | FINISHED. */
    phase: t.string(),
    /** Numero de la salle en cours. 0 tant que la partie n'a pas commence. */
    room: t.number(),
    /** Indexe par sessionId. */
    players: t.map(PlayerState),
    /** L'historique du chat, dans l'ordre. */
    chat: t.array(ChatEntry),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
