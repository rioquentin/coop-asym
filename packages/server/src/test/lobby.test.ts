import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  GameState,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME,
} from "@coop/shared";
import { demarrerServeur, ignorerMessages, until } from "./harness";

const PORT = 2599;
const ENDPOINT = `ws://localhost:${PORT}`;

type Partie = Room<unknown, GameState>;

let server: Server;

function connect(): Client {
  return new Client(ENDPOINT);
}

/** Ouvre une room et absorbe ses messages de jeu : ici on teste le lobby. */
async function creer(client: Client = connect()): Promise<Partie> {
  const room = await client.create<GameState>(ROOM_NAME, {}, GameState);
  ignorerMessages(room);
  return room;
}

async function rejoindre(
  code: string,
  client: Client = connect(),
): Promise<Partie> {
  const room = await client.joinById<GameState>(code, {}, GameState);
  ignorerMessages(room);
  return room;
}

beforeAll(async () => {
  server = await demarrerServeur(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("lobby", () => {
  it("attribue un code de 4 lettres sans caractere ambigu", async () => {
    const room = await creer();
    try {
      expect(room.roomId).toHaveLength(ROOM_CODE_LENGTH);
      for (const letter of room.roomId) {
        expect(ROOM_CODE_ALPHABET).toContain(letter);
      }
      expect(room.roomId).not.toMatch(/[IOL01]/);
    } finally {
      await room.leave(true);
    }
  });

  it("passe a 2/2 et distribue les roles A et B", async () => {
    const hote = await creer();
    let invite: Partie | undefined;
    try {
      await until(() => hote.state?.phase === "WAITING");
      expect(hote.state.players.size).toBe(1);

      invite = await rejoindre(hote.roomId);

      await until(() => hote.state.phase === "PLAYING");
      await until(() => invite!.state.phase === "PLAYING");

      expect(hote.state.players.size).toBe(2);

      const roles = [...hote.state.players.values()].map((p) => p.role).sort();
      expect(roles).toEqual(["A", "B"]);
    } finally {
      await invite?.leave(true);
      await hote.leave(true);
    }
  });

  it("refuse un code inconnu", async () => {
    await expect(
      connect().joinById<GameState>("ZZZZ", {}, GameState),
    ).rejects.toBeDefined();
  });

  it("refuse un troisieme joueur", async () => {
    const hote = await creer();
    const invite = await rejoindre(hote.roomId);
    try {
      await until(() => hote.state.phase === "PLAYING");
      await expect(
        connect().joinById<GameState>(hote.roomId, {}, GameState),
      ).rejects.toBeDefined();
    } finally {
      await invite.leave(true);
      await hote.leave(true);
    }
  });

  it("restaure le role et la partie apres une deconnexion subie", async () => {
    const hote = await creer();
    const inviteClient = connect();
    let invite = await rejoindre(hote.roomId, inviteClient);
    try {
      await until(() => hote.state.phase === "PLAYING");
      const roleAvant = invite.state.players.get(invite.sessionId)?.role;
      const jeton = invite.reconnectionToken;

      // consented = false : c'est un onglet ferme brutalement, pas un depart.
      await invite.leave(false);
      await until(() => hote.state.phase === "PAUSED");

      invite = await inviteClient.reconnect<GameState>(jeton, GameState);
      ignorerMessages(invite);
      await until(() => hote.state.phase === "PLAYING");

      expect(invite.state.players.get(invite.sessionId)?.role).toBe(roleAvant);
      expect(hote.state.players.size).toBe(2);
    } finally {
      await invite.leave(true);
      await hote.leave(true);
    }
  });

  it("ne synchronise que des champs publics", async () => {
    const room = await creer();
    try {
      await until(() => room.state?.phase === "WAITING");
      // Garde-fou : si une donnee d'enigme ou une vue arrive un jour dans
      // l'etat partage, ce test tombe avant qu'un joueur ne la lise.
      expect(Object.keys(room.state.toJSON()).sort()).toEqual([
        "code",
        "phase",
        "players",
      ]);
    } finally {
      await room.leave(true);
    }
  });
});
