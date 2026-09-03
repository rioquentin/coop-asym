import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE,
  DEMO_PUZZLE_ID,
  GameState,
  ROOM_NAME,
  type Action,
  type ClientMessage,
  type ServerMessage,
} from "@coop/shared";
import { demarrerServeur, respirer, until } from "./harness";

const PORT = 2598;
const ENDPOINT = `ws://localhost:${PORT}`;

let server: Server;

/** Tout ce qu'un client a recu du serveur, dans l'ordre. */
interface Journal {
  type: string | number;
  payload: unknown;
}

interface Poste {
  room: Room<unknown, GameState>;
  journal: Journal[];
  /** Derniere vue recue par ce joueur. */
  vue(): Extract<ServerMessage, { t: "view" }>["view"] | undefined;
  dernierFeedback(): Extract<ServerMessage, { t: "feedback" }> | undefined;
  aRecuFin(): boolean;
  agir(action: Action): void;
}

/**
 * Branche un enregistreur exhaustif sur une room.
 *
 * On enregistre via le joker `"*"` et RIEN d'autre : le SDK ne l'appelle que
 * s'il n'existe aucun gestionnaire specifique, donc ce journal contient
 * litteralement tout ce que le serveur a envoye a ce joueur.
 */
function observer(room: Room<unknown, GameState>): Poste {
  const journal: Journal[] = [];
  room.onMessage("*", (type, payload) => {
    journal.push({ type, payload });
  });

  const messages = (): ServerMessage[] =>
    journal
      .filter((entree) => entree.type === "s")
      .map((entree) => entree.payload as ServerMessage);

  return {
    room,
    journal,
    vue() {
      const vues = messages().filter((m) => m.t === "view");
      return vues.at(-1)?.view;
    },
    dernierFeedback() {
      return messages()
        .filter((m) => m.t === "feedback")
        .at(-1);
    },
    aRecuFin() {
      return messages().some((m) => m.t === "finished");
    },
    agir(action: Action) {
      const message: ClientMessage = {
        t: "action",
        puzzleId: DEMO_PUZZLE_ID,
        action,
      };
      room.send(CLIENT_MESSAGE, message);
    },
  };
}

let ouverts: Poste[] = [];

/** Ouvre une partie complete, les deux postes observes des la creation. */
async function ouvrirPartie(): Promise<{ a: Poste; b: Poste }> {
  const roomA = await new Client(ENDPOINT).create<GameState>(
    ROOM_NAME,
    {},
    GameState,
  );
  const a = observer(roomA);

  const roomB = await new Client(ENDPOINT).joinById<GameState>(
    roomA.roomId,
    {},
    GameState,
  );
  const b = observer(roomB);

  ouverts.push(a, b);

  await until(() => roomA.state.phase === "PLAYING");
  await until(() => a.vue() !== undefined && b.vue() !== undefined);

  // Le createur est le premier arrive, donc le prepose A.
  expect(roomA.state.players.get(roomA.sessionId)?.role).toBe("A");
  expect(roomB.state.players.get(roomB.sessionId)?.role).toBe("B");

  return { a, b };
}

beforeAll(async () => {
  server = await demarrerServeur(PORT);
});

afterEach(async () => {
  for (const poste of ouverts) await poste.room.leave(true);
  ouverts = [];
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("boucle reseau", () => {
  it("donne a chaque role une vue differente", async () => {
    const { a, b } = await ouvrirPartie();

    expect(a.vue()).toEqual({ kind: "button" });
    expect(b.vue()).toEqual({ kind: "light", lit: false });
  });

  it("propage l'action de A jusqu'a la vue de B, et a elle seule", async () => {
    const { a, b } = await ouvrirPartie();

    a.agir({ type: "press" });
    await until(() => (b.vue() as { lit?: boolean } | undefined)?.lit === true);

    a.agir({ type: "press" });
    await until(() => (b.vue() as { lit?: boolean } | undefined)?.lit === false);

    // La vue de A n'a jamais bouge : elle ne porte aucune information.
    expect(a.vue()).toEqual({ kind: "button" });
  });

  it("ne laisse jamais fuir l'etat de la lampe vers A", async () => {
    const { a, b } = await ouvrirPartie();

    a.agir({ type: "press" });
    await until(() => (b.vue() as { lit?: boolean } | undefined)?.lit === true);
    await respirer();

    // Garde-fou du jalon 2 : TOUT ce que A a recu, message par message.
    const toutCeQueARecu = JSON.stringify(a.journal);
    expect(toutCeQueARecu).not.toContain("lit");
    expect(toutCeQueARecu).not.toContain("light");

    // Et rien de l'enigme n'est passe par l'etat synchronise.
    expect(JSON.stringify(a.room.state.toJSON())).not.toContain("lit");
  });

  it("refuse l'intention qui n'est pas celle de son role", async () => {
    const { a, b } = await ouvrirPartie();

    a.agir({ type: "confirm" });
    await until(() => a.dernierFeedback() !== undefined);
    expect(a.dernierFeedback()?.kind).toBe("rejected");

    b.agir({ type: "press" });
    await until(() => b.dernierFeedback() !== undefined);
    expect(b.dernierFeedback()?.kind).toBe("rejected");

    // Un refus n'a rien change : la partie continue.
    expect(a.room.state.phase).toBe("PLAYING");
  });

  it("refuse avec un motif plutot qu'avec un silence", async () => {
    const { b } = await ouvrirPartie();

    b.agir({ type: "confirm" });
    await until(() => b.dernierFeedback() !== undefined);

    const feedback = b.dernierFeedback();
    expect(feedback?.kind).toBe("rejected");
    // Contrainte C2 : l'echec apprend quelque chose.
    expect(feedback?.hint).toBeTruthy();
    expect(b.room.state.phase).toBe("PLAYING");
  });

  it("termine la partie quand les deux gestes se repondent", async () => {
    const { a, b } = await ouvrirPartie();

    a.agir({ type: "press" });
    await until(() => (b.vue() as { lit?: boolean } | undefined)?.lit === true);

    b.agir({ type: "confirm" });
    await until(() => a.aRecuFin() && b.aRecuFin());
    await until(() => a.room.state.phase === "FINISHED");
  });

  it("refuse toute intention hors phase de jeu", async () => {
    const roomA = await new Client(ENDPOINT).create<GameState>(
      ROOM_NAME,
      {},
      GameState,
    );
    const a = observer(roomA);
    ouverts.push(a);

    await until(() => roomA.state.phase === "WAITING");
    a.agir({ type: "press" });
    await until(() => a.dernierFeedback() !== undefined);

    expect(a.dernierFeedback()?.kind).toBe("rejected");
    expect(a.vue()).toBeUndefined();
  });
});
