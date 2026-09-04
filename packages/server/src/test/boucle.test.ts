import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { Client, type Room } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE,
  GameState,
  ROOM_NAME,
  type Action,
  type ClientMessage,
  type Direction,
  type GridView,
  type LegendView,
  type ArpentView,
  type ClavierView,
  type LitanieView,
  type PosteView,
  type ReleveView,
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
  nbVues(): number;
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
    nbVues() {
      return messages().filter((m) => m.t === "view").length;
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
      // Comme le vrai client : on renvoie l'identifiant que le serveur a
      // donne avec la derniere vue. Aucun identifiant n'est connu d'avance.
      const puzzleId = messages()
        .filter((m) => m.t === "view")
        .at(-1)?.puzzleId;
      const message: ClientMessage = {
        t: "action",
        puzzleId: puzzleId ?? PUZZLE_ID,
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
  const idParSens = new Map(
    vueB.legend.map(([glyphe, sens]) => [sens, glyphe.id]),
  );
  return vueB.target.map((sens, position) => {
    const id = idParSens.get(sens);
    return {
      type: "place",
      from: vueA.tray.findIndex((glyphe) => glyphe.id === id),
      to: position,
    };
  });
}

/**
 * Fait resoudre la salle 1 par le duo, en ne croisant que les deux vues.
 */
async function resoudreLeLexique(
  a: Poste,
  b: Poste,
): Promise<Map<string, string>> {
  const vueB = b.vue() as LegendView;
  const plan = planDuDuo(a.vue() as GridView, vueB);
  for (const action of plan) {
    a.agir(action);
    await until(() => a.dernierFeedback()?.kind === "accepted");
  }
  b.agir({ type: "validate" });

  // Ce que le duo emporte de la salle 1 : la correspondance forme -> sens.
  // C'est tout ce dont il dispose pour la salle 3, exactement comme un joueur.
  return new Map(vueB.legend.map(([glyphe, sens]) => [glyphe.id, sens]));
}

const INVERSE: Record<Direction, Direction> = {
  nord: "sud",
  sud: "nord",
  est: "ouest",
  ouest: "est",
};
const DELTA: Record<Direction, [number, number]> = {
  nord: [0, -1],
  est: [1, 0],
  sud: [0, 1],
  ouest: [-1, 0],
};

/**
 * Parcourt tout le lieu en profondeur, position tenue a l'estime, et laisse
 * `surPlace` agir a chaque case atteinte. B ne sait pas ou il est ; il sait
 * seulement d'ou il vient.
 */
async function parcourir(
  b: Poste,
  ouvertures: () => Direction[],
  surPlace: () => Promise<boolean>,
): Promise<void> {
  let x = 0;
  let y = 0;
  const visitees = new Set<string>();
  const parcours: Direction[] = [];

  const avancer = async (direction: Direction): Promise<void> => {
    const avant = b.nbVues();
    b.agir({ type: "avancer", direction });
    await until(() => b.nbVues() > avant);
    x += DELTA[direction][0];
    y += DELTA[direction][1];
  };

  for (let pas = 0; pas < 300; pas++) {
    if (await surPlace()) return;
    visitees.add(`${x},${y}`);

    const inexploree = ouvertures().find((direction) => {
      const [dx, dy] = DELTA[direction];
      return !visitees.has(`${x + dx},${y + dy}`);
    });

    if (inexploree) {
      parcours.push(inexploree);
      await avancer(inexploree);
      continue;
    }

    const retour = parcours.pop();
    if (!retour) return;
    await avancer(INVERSE[retour]);
  }
}

/**
 * Fait resoudre la salle 2. B marche a l'aveugle — le test n'a pas plus
 * d'information que lui — et A scelle quand B annonce etre arrive.
 *
 * B explore en profondeur en tenant sa position a l'estime : il ne sait pas
 * ou il est sur le plan, mais il sait d'ou il vient. C'est exactement ce
 * qu'un joueur fait, et ca couvre un plan connexe en un nombre de pas borne.
 */
async function resoudreLaTopologie(a: Poste, b: Poste): Promise<void> {
  let arrive = false;
  await parcourir(
    b,
    () => (b.vue() as PosteView).ouvertures,
    async () => {
      if (!(b.vue() as PosteView).surLeDepot) return false;
      a.agir({ type: "sceller" });
      arrive = true;
      return true;
    },
  );
  if (!arrive) throw new Error("le depot n'a pas ete atteint");
}

/**
 * Fait resoudre la salle 3. Le test ne dispose que des deux vues et de la
 * correspondance rapportee de la salle 1 — comme le duo.
 *
 * A lit l'ordre des significations attendues ; B voit les formes gravees.
 * Le pont entre les deux n'est sur aucun des deux ecrans.
 */
async function resoudreLeReleve(
  a: Poste,
  b: Poste,
  sensDe: Map<string, string>,
): Promise<void> {
  const attendus = (a.vue() as ReleveView).attendus;

  const complet = (): boolean =>
    ((b.vue() as ArpentView).progres ?? 0) >= attendus.length;

  // Une passe par releve suffit : le lieu est parcouru en entier a chaque fois.
  for (let passe = 0; passe <= attendus.length && !complet(); passe++) {
    await parcourir(
      b,
      () => (b.vue() as ArpentView).ouvertures,
      async () => {
        if (complet()) return true;
        const vue = b.vue() as ArpentView;
        const attendu = attendus[vue.progres];
        if (!vue.grave || sensDe.get(vue.grave.id) !== attendu) return false;

        const avant = b.nbVues();
        b.agir({ type: "relever" });
        await until(() => b.nbVues() > avant || b.dernierFeedback() !== undefined);
        return complet();
      },
    );
  }

  if (!complet()) throw new Error("le releve n'a pas ete complete");
  a.agir({ type: "sceller" });
}

/**
 * Fait resoudre la salle 4. Le test ne dispose que des deux vues et de la
 * correspondance rapportee de la salle 1 — comme le duo.
 *
 * A lit la suite AVANT d'armer le mecanisme, puis elle disparait de sa vue.
 * Ensuite chacun s'engage a l'aveugle, sans voir ce que l'autre a engage.
 */
async function resoudreLaLitanie(
  a: Poste,
  b: Poste,
  sensDe: Map<string, string>,
): Promise<void> {
  const glypheDuSens = new Map(
    [...sensDe.entries()].map(([glyphe, sens]) => [sens, glyphe]),
  );

  const vueA = a.vue() as LitanieView;
  // Ce que le duo se dit pendant la preparation : la suite, en significations.
  const suite = vueA.suite;
  if (!suite) throw new Error("la suite devrait etre lisible avant l'engagement");

  const avantEngagement = a.nbVues();
  a.agir({ type: "engager" });
  await until(() => a.nbVues() > avantEngagement);
  expect((a.vue() as LitanieView).suite).toBeNull();

  for (const sens of suite) {
    const attendu = (a.vue() as LitanieView).progres + 1;
    const clavierA = (a.vue() as LitanieView).clavier;
    const clavierB = (b.vue() as ClavierView).clavier;

    const glyphe = glypheDuSens.get(sens) as string;
    a.agir({ type: "presser", index: clavierA.indexOf(sens) });
    b.agir({
      type: "presser",
      index: clavierB.findIndex((forme) => forme.id === glyphe),
    });

    await until(() => (a.vue() as LitanieView).progres >= attendu);
  }
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
    const idAttendu = vueA.tray[premier.from]?.id;

    a.agir(premier);
    await until(
      () => (b.vue() as LegendView).slots[premier.to]?.id === idAttendu,
    );
    expect((a.vue() as GridView).slots[premier.to]?.id).toBe(idAttendu);
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
    expect(a.room.state.room).toBe(1);

    b.agir({ type: "validate" });
    // La salle 1 resolue ouvre la salle 2, elle ne termine pas la partie.
    await until(() => a.room.state.room === 2);
  });

  it("enchaine sur la salle 2 en changeant les deux vues", async () => {
    const { a, b } = await ouvrirPartie();

    await resoudreLeLexique(a, b);
    await until(() => a.room.state.room === 2);
    await until(() => a.vue()?.kind === "plan" && b.vue()?.kind === "poste");

    // La primitive a change : plus un glyphe a l'ecran, de part et d'autre.
    expect(JSON.stringify(a.journal)).toContain("murs");
    expect(JSON.stringify(b.vue())).not.toContain("murs");
    expect(a.aRecuFin()).toBe(false);
  });

  it("ne montre a B ni le plan ni l'ordre en salle 3", async () => {
    const { a, b } = await ouvrirPartie();

    const sensDe = await resoudreLeLexique(a, b);
    await until(() => b.vue()?.kind === "poste");
    await resoudreLaTopologie(a, b);
    await until(() => b.vue()?.kind === "arpent");

    // B a legitimement vu les significations EN SALLE 1 — c'est meme tout
    // l'objet de la continuite. Ce qu'on verifie ici, c'est qu'elles ne lui
    // sont pas resservies en salle 3.
    const depuisLaSalle3 = b.journal.length;
    const vueB = b.vue() as ArpentView;
    expect(Object.keys(vueB).sort()).toEqual([
      "grave",
      "kind",
      "ouvertures",
      "progres",
    ]);

    // Les significations attendues sont chez A, et nulle part chez B.
    await respirer();
    const recuParB = JSON.stringify(b.journal.slice(depuisLaSalle3 - 1));
    for (const attendu of (a.vue() as ReleveView).attendus) {
      expect(recuParB.includes(`"${attendu}"`)).toBe(false);
    }
    // Et le sens des formes n'est sur aucun des deux ecrans.
    expect(JSON.stringify(a.journal)).not.toContain("grave");
    expect(sensDe.size).toBeGreaterThan(0);
  });

  it("traverse la chaine entiere avec les seules deux vues", async () => {
    const { a, b } = await ouvrirPartie();

    // Salle 1 : le duo repart avec sa correspondance forme -> sens.
    const sensDe = await resoudreLeLexique(a, b);
    await until(() => a.vue()?.kind === "plan" && b.vue()?.kind === "poste");

    // Salle 2 : l'espace, sans aucun glyphe.
    await resoudreLaTopologie(a, b);
    await until(() => a.vue()?.kind === "releve" && b.vue()?.kind === "arpent");
    // L'etat synchronise et les vues ciblees sont deux canaux distincts :
    // on attend le premier, on ne le suppose pas arrive avec le second.
    await until(() => a.room.state.room === 3);

    // Salle 3 : les deux a la fois, et le lexique de la salle 1 est le pont.
    await resoudreLeReleve(a, b, sensDe);
    await until(
      () => a.vue()?.kind === "litanie" && b.vue()?.kind === "clavier",
    );
    await until(() => a.room.state.room === 4);

    // Salle 4 : rien de neuf, tout de memoire, et chacun s'engage en aveugle.
    await resoudreLaLitanie(a, b, sensDe);
    await until(() => a.aRecuFin() && b.aRecuFin());
    await until(() => a.room.state.phase === "FINISHED");
  }, 90_000);

  it("masque la suite des que le mecanisme est arme", async () => {
    const { a, b } = await ouvrirPartie();

    const sensDe = await resoudreLeLexique(a, b);
    await until(() => b.vue()?.kind === "poste");
    await resoudreLaTopologie(a, b);
    await until(() => b.vue()?.kind === "arpent");
    await resoudreLeReleve(a, b, sensDe);
    await until(() => a.vue()?.kind === "litanie");

    // Avant : la suite est lisible. C'est la phase ou l'on planifie.
    expect((a.vue() as LitanieView).suite).not.toBeNull();

    const avant = a.nbVues();
    a.agir({ type: "engager" });
    await until(() => a.nbVues() > avant);

    // Apres : ce qui n'a pas ete memorise est perdu jusqu'au relachement.
    expect((a.vue() as LitanieView).suite).toBeNull();

    // Relacher ne fait rien perdre et rend la suite. Le prix d'un defaut de
    // plan est un aller-retour, pas une punition (C2).
    const avantRelache = a.nbVues();
    a.agir({ type: "relacher" });
    await until(() => a.nbVues() > avantRelache);
    expect((a.vue() as LitanieView).suite).not.toBeNull();

    // Et B n'a jamais rien vu de la suite.
    expect(JSON.stringify(b.vue())).not.toContain("suite");
  }, 60_000);

  it("ne dit jamais a l'un ce que l'autre a engage", async () => {
    const { a, b } = await ouvrirPartie();

    const sensDe = await resoudreLeLexique(a, b);
    await until(() => b.vue()?.kind === "poste");
    await resoudreLaTopologie(a, b);
    await until(() => b.vue()?.kind === "arpent");
    await resoudreLeReleve(a, b, sensDe);
    await until(() => a.vue()?.kind === "litanie");

    const avant = a.nbVues();
    a.agir({ type: "engager" });
    await until(() => a.nbVues() > avant);

    // A s'engage seul : B apprend qu'il s'est engage, jamais sur quoi.
    const avantB = b.nbVues();
    a.agir({ type: "presser", index: 0 });
    await until(() => b.nbVues() > avantB);

    const vueB = b.vue() as ClavierView;
    expect(vueB.partenairePret).toBe(true);
    expect(vueB.votreEngagement).toBeNull();
    await respirer();
    // Rien dans ce que B a recu ne porte le choix de A.
    expect(JSON.stringify(b.vue())).not.toContain("engagementA");
  }, 60_000);

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
    const idAttendu = (a.vue() as GridView).tray[premier.from]?.id;
    a.agir(premier);
    await until(
      () => (b.vue() as LegendView).slots[premier.to]?.id === idAttendu,
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
      () =>
        (b.vue() as LegendView | undefined)?.slots[premier.to]?.id ===
        idAttendu,
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
