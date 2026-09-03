import { Room, logger, type Client } from "@colyseus/core";
import {
  CLIENT_MESSAGE,
  GameState,
  PlayerState,
  RECONNECTION_WINDOW_SECONDS,
  ROOM_TTL_MS,
  SERVER_MESSAGE,
  type ClientMessage,
  type Role,
  type RoomPhase,
  type ServerMessage,
} from "@coop/shared";
import { demoPuzzle, type DemoInstance } from "../puzzles/demo";
import { allocateRoomCode } from "./roomCode";

/** Le minuteur rendu par `clock.setTimeout`, sans dependre de @colyseus/timer. */
type TtlTimer = ReturnType<Room["clock"]["setTimeout"]>;

/** Ordre d'attribution des roles : premier arrive, premier servi. */
const ROLE_ORDER: readonly Role[] = ["A", "B"];

/**
 * Une partie. Deux joueurs exactement, du lobby a la fin.
 *
 * Cycle de vie : CREATED -> WAITING (1/2) -> PLAYING, avec PAUSED quand un
 * joueur decroche. Voir docs/architecture.md section 3.
 *
 * Le jalon 1 s'arrete au lobby : il n'y a pas encore d'enigme, donc pas encore
 * de vue a filtrer ni de phase FINISHED atteignable.
 */
export class GameRoom extends Room<{ state: GameState }> {
  /** Minuteur de destruction de la phase courante. Voir armTtl(). */
  private ttlTimer?: TtlTimer;

  /**
   * L'instance d'enigme en cours.
   *
   * Volontairement une propriete privee et NON un champ du Schema : elle ne
   * doit jamais partir en synchronisation. Les joueurs n'en recoivent que ce
   * que `viewFor` en extrait, en message cible.
   */
  private instance?: DemoInstance;

  override async onCreate(): Promise<void> {
    this.maxClients = 2;

    // autoDispose detruirait la room des que le dernier client decroche, donc
    // instantanement en PAUSED. Le balayage est fait a la main par armTtl().
    this.autoDispose = false;

    this.roomId = await allocateRoomCode();
    this.setState(new GameState({ code: this.roomId, phase: "WAITING" }));

    // On ne rejoint que par code dicte : pas de listing public.
    await this.setPrivate(true);

    this.onMessage(CLIENT_MESSAGE, (client: Client, message: ClientMessage) => {
      this.handleClientMessage(client, message);
    });

    this.armTtl();
  }

  override onJoin(client: Client): void {
    this.state.players.set(
      client.sessionId,
      new PlayerState({ role: "", connected: true }),
    );

    if (this.state.players.size === this.maxClients) {
      this.startPlaying();
    }
  }

  /**
   * Deconnexion subie (onglet ferme brutalement, reseau coupe, refresh).
   * C'est le cas nominal, pas une erreur : on fige et on garde tout.
   */
  override async onDrop(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    // Une partie en cours se fige. Une room encore en attente reste en
    // attente : son minuteur WAITING tourne deja depuis onCreate().
    if (this.state.phase === "PLAYING") {
      this.setPhase("PAUSED");
    }

    try {
      await this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS);
    } catch {
      // Fenetre epuisee. Colyseus enchaine sur onLeave(), qui tranche.
    }
  }

  /** Retour d'un joueur dans la fenetre de reconnexion. Meme role, meme etat. */
  override onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;

    if (this.state.phase === "PAUSED" && this.allPlayersConnected()) {
      this.setPhase("PLAYING");
    }

    // Le joueur ne doit rien reperdre : sa vue lui est rendue telle quelle.
    this.pushView(client);
  }

  /**
   * Depart definitif : soit volontaire, soit fenetre de reconnexion epuisee.
   */
  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);

    // Une partie commencee ne se recompose pas avec un inconnu : perdre un
    // role, c'est perdre la room. En WAITING au contraire la place se libere.
    const gameStarted = this.state.phase !== "WAITING";
    if (gameStarted || this.state.players.size === 0) {
      void this.disconnect();
      return;
    }

    this.armTtl();
  }

  override onDispose(): void {
    this.ttlTimer?.clear();
  }

  /** Attribution des roles, une seule fois, a l'entree en PLAYING. */
  private startPlaying(): void {
    let index = 0;
    for (const player of this.state.players.values()) {
      player.role = ROLE_ORDER[index] ?? "";
      index++;
    }
    this.instance = demoPuzzle.generate();
    this.setPhase("PLAYING");
    this.pushViews();
  }

  // ---------------------------------------------------------------------
  // Boucle de jeu
  // ---------------------------------------------------------------------

  /**
   * Point d'entree unique des messages client. Tout ce qui arrive ici vient
   * du reseau, donc n'est pas digne de confiance : on ne lit un champ qu'apres
   * l'avoir verifie.
   */
  private handleClientMessage(client: Client, message: ClientMessage): void {
    if (typeof message?.t !== "string") return;

    switch (message.t) {
      case "action":
        this.handleAction(client, message);
        return;
      case "ping":
        return;
      default:
        // `chat` et `ready` sont declares au protocole mais pas encore cables.
        return;
    }
  }

  /**
   * Autorite serveur. Le client envoie une intention ; c'est ici, et nulle
   * part ailleurs, qu'on decide de ce qu'elle produit.
   */
  private handleAction(
    client: Client,
    message: Extract<ClientMessage, { t: "action" }>,
  ): void {
    const role = this.roleOf(client);

    if (this.state.phase !== "PLAYING" || !this.instance || !role) {
      this.sendTo(client, {
        t: "feedback",
        kind: "rejected",
        hint: "La partie n'est pas en cours.",
      });
      return;
    }

    if (message.puzzleId !== demoPuzzle.id) {
      this.sendTo(client, {
        t: "feedback",
        kind: "rejected",
        hint: "Ce n'est pas la piece en cours.",
      });
      return;
    }

    const result = demoPuzzle.applyAction(this.instance, role, message.action);
    this.instance = result.instance;

    this.sendTo(client, { t: "feedback", ...result.feedback });

    if (result.feedback.kind === "accepted") {
      this.pushViews();
      if (demoPuzzle.isSolved(this.instance)) this.finish();
    }
  }

  private finish(): void {
    this.broadcast(SERVER_MESSAGE, { t: "finished" } satisfies ServerMessage);
    this.setPhase("FINISHED");
  }

  /** Envoie a chaque joueur SA vue, et rien d'autre. */
  private pushViews(): void {
    for (const client of this.clients) this.pushView(client);
  }

  private pushView(client: Client): void {
    const role = this.roleOf(client);
    if (!this.instance || !role) return;

    this.sendTo(client, {
      t: "view",
      puzzleId: demoPuzzle.id,
      role,
      view: demoPuzzle.viewFor(role, this.instance),
    });
  }

  /** Seul chemin de sortie vers un client. Type par le protocole partage. */
  private sendTo(client: Client, message: ServerMessage): void {
    client.send(SERVER_MESSAGE, message);
  }

  private roleOf(client: Client): Role | undefined {
    const role = this.state.players.get(client.sessionId)?.role;
    return role === "A" || role === "B" ? role : undefined;
  }

  private allPlayersConnected(): boolean {
    if (this.state.players.size !== this.maxClients) return false;
    for (const player of this.state.players.values()) {
      if (!player.connected) return false;
    }
    return true;
  }

  private setPhase(phase: RoomPhase): void {
    if (this.state.phase === phase) return;
    this.state.phase = phase;
    this.armTtl();
  }

  /**
   * Balayage des rooms mortes (docs/architecture.md section 3).
   *
   * Chaque room porte son propre minuteur de destruction plutot que de
   * dependre d'un balayage global : le minuteur nait et meurt avec la room,
   * donc il ne peut pas exister de room orpheline qu'un balayeur aurait
   * oubliee. PLAYING est la seule phase sans minuteur — une partie en cours
   * n'est jamais detruite sous les pieds des joueurs.
   */
  private armTtl(): void {
    this.ttlTimer?.clear();
    this.ttlTimer = undefined;

    const phase = this.state.phase as RoomPhase;
    if (phase === "PLAYING") return;

    const ttl = ROOM_TTL_MS[phase];
    this.ttlTimer = this.clock.setTimeout(() => {
      logger.info(`[room ${this.roomId}] detruite apres ${ttl}ms en ${phase}`);
      void this.disconnect();
    }, ttl);
  }
}
