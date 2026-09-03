import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE,
  GameState,
  ROOM_NAME,
  type Action,
  type ClientMessage,
  type GridView,
  type LegendView,
  type ServerMessage,
} from "@coop/shared";
import { CHAINE_DES_SALLES } from "../content/chaine";
import { chargerDefinition } from "../content/loader";
import { demarrerServeur, respirer, until } from "./harness";

const PORT = 2598;
const ENDPOINT = `ws://localhost:${PORT}`;
const PUZZLE_ID = chargerDefinition(CHAINE_DES_SALLES[0]).id;

let server: Server;

/** Tout ce qu'un client a recu du serveur, dans l'ordre. */
interface Journal {
  type: string | number;
  payload: unknown;
}

interface Poste {
  room: Room<unknown, GameState>;
  journal: Journal[];
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
      return messages()
        .filter((m) => m.t === "view")
        .at(-1)?.view;
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
        puzzleId: PUZZLE_ID,
        action,
      };
      room.send(CLIENT_MESSAGE, message);
    },
  };
}

let ouverts: Poste[] = [];

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

  expect(roomA.state.players.get(roomA.sessionId)?.role).toBe("A");
  expect(roomB.state.players.get(roomB.sessionId)?.role).toBe("B");

  return { a, b };
}

/** Joue la partie comme un duo : en croisant les deux vues, et elles seules. */
function planDuDuo(vueA: GridView, vueB: LegendView): Action[] {
  const glypheDuSens = new Map(
    vueB.legend.map(([glyphe, sens]) => [sens, glyphe]),
  );
  return vueB.target.map((sens, position) => {
    const glyphe = glypheDuSens.get(sens) as string;
    return { type: "place", from: vueA.tray.indexOf(glyphe), to: position };
  });
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
  it("donne a chaque role une vue de forme differente", async () => {
    const { a, b } = await ouvrirPartie();

    const vueA = a.vue() as GridView;
    const vueB = b.vue() as LegendView;

    expect(vueA.kind).toBe("grid");
    expect(Object.keys(vueA).sort()).toEqual(["kind", "slots", "tray"]);

    expect(vueB.kind).toBe("legend");
    expect(Object.keys(vueB).sort()).toEqual([
      "kind",
      "legend",
      "slots",
      "target",
    ]);
  });

  it("ne laisse jamais fuir la legende ni la cible vers A", async () => {
    const { a, b } = await ouvrirPartie();

    const vueB = b.vue() as LegendView;
    const vueA = a.vue() as GridView;
    a.agir(planDuDuo(vueA, vueB)[0] as Action);
    await until(() => a.dernierFeedback()?.kind === "accepted");
    await respirer();

    // Garde-fou : TOUT ce que A a recu, message par message.
    const recuParA = JSON.stringify(a.journal);
    expect(recuParA).not.toContain("legend");
    expect(recuParA).not.toContain("target");
    for (const [, sens] of vueB.legend) {
      // Aucune signification ne doit apparaitre, sous aucune forme.
      expect(recuParA.includes(`"${sens}"`)).toBe(false);
    }

    // Et rien de l'enigme n'est passe par l'etat synchronise.
    expect(JSON.stringify(a.room.state.toJSON())).not.toContain("tray");
  });

  it("ne laisse jamais fuir le plateau de A vers B", async () => {
    const { a, b } = await ouvrirPartie();

    const vueA = a.vue() as GridView;
    a.agir(planDuDuo(vueA, b.vue() as LegendView)[0] as Action);
    await until(() => a.dernierFeedback()?.kind === "accepted");
    await respirer();

    // B ne doit jamais apprendre dans quel ORDRE A voit ses glyphes : c'est
    // ce qui l'empeche de produire seul la suite d'intentions.
    expect(JSON.stringify(b.journal)).not.toContain("tray");
  });

  it("propage l'action de A jusqu'a la vue de B", async () => {
    const { a, b } = await ouvrirPartie();

    const vueA = a.vue() as GridView;
    const premier = planDuDuo(vueA, b.vue() as LegendView)[0] as Extract<
      Action,
      { type: "place" }
    >;
    const glypheAttendu = vueA.tray[premier.from];

    a.agir(premier);
    await until(
      () => (b.vue() as LegendView).slots[premier.to] === glypheAttendu,
    );
    expect((a.vue() as GridView).slots[premier.to]).toBe(glypheAttendu);
  });

  it("refuse l'intention qui n'est pas celle de son role", async () => {
    const { a, b } = await ouvrirPartie();

    a.agir({ type: "validate" });
    await until(() => a.dernierFeedback() !== undefined);
    expect(a.dernierFeedback()?.kind).toBe("rejected");

    b.agir({ type: "place", from: 0, to: 0 });
    await until(() => b.dernierFeedback() !== undefined);
    expect(b.dernierFeedback()?.kind).toBe("rejected");

    expect(a.room.state.phase).toBe("PLAYING");
  });

  it("refuse avec un motif plutot qu'avec un silence", async () => {
    const { b } = await ouvrirPartie();

    b.agir({ type: "validate" });
    await until(() => b.dernierFeedback() !== undefined);

    const feedback = b.dernierFeedback();
    expect(feedback?.kind).toBe("rejected");
    // Contrainte C2 : l'echec apprend quelque chose.
    expect(feedback?.hint).toBeTruthy();
    expect(b.room.state.phase).toBe("PLAYING");
  });

  it("se resout quand les deux vues sont mises en commun, et pas avant", async () => {
    const { a, b } = await ouvrirPartie();

    const plan = planDuDuo(a.vue() as GridView, b.vue() as LegendView);
    for (const action of plan) {
      a.agir(action);
      await until(() => a.dernierFeedback()?.kind === "accepted");
    }

    // Le plateau est bon mais personne n'a encore consigne.
    expect(a.aRecuFin()).toBe(false);

    b.agir({ type: "validate" });
    await until(() => a.aRecuFin() && b.aRecuFin());
    await until(() => a.room.state.phase === "FINISHED");
  });

  it("rend a un revenant la vue qu'il avait laissee", async () => {
    const clientB = new Client(ENDPOINT);
    const roomA = await new Client(ENDPOINT).create<GameState>(
      ROOM_NAME,
      {},
      GameState,
    );
    const a = observer(roomA);
    let roomB = await clientB.joinById<GameState>(roomA.roomId, {}, GameState);
    let b = observer(roomB);
    ouverts.push(a, b);

    await until(() => roomA.state.phase === "PLAYING");
    await until(() => a.vue() !== undefined && b.vue() !== undefined);

    const premier = planDuDuo(
      a.vue() as GridView,
      b.vue() as LegendView,
    )[0] as Extract<Action, { type: "place" }>;
    const glypheAttendu = (a.vue() as GridView).tray[premier.from];
    a.agir(premier);
    await until(
      () => (b.vue() as LegendView).slots[premier.to] === glypheAttendu,
    );

    const jeton = roomB.reconnectionToken;
    await roomB.leave(false);
    await until(() => roomA.state.phase === "PAUSED");

    roomB = await clientB.reconnect<GameState>(jeton, GameState);
    b = observer(roomB);
    ouverts = [a, b];

    await until(() => roomA.state.phase === "PLAYING");
    // Le joueur ne doit rien reperdre : le glyphe est toujours pose.
    await until(
      () => (b.vue() as LegendView | undefined)?.slots[premier.to] ===
        glypheAttendu,
    );
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
    a.agir({ type: "place", from: 0, to: 0 });
    await until(() => a.dernierFeedback() !== undefined);

    expect(a.dernierFeedback()?.kind).toBe("rejected");
    expect(a.vue()).toBeUndefined();
  });
});
