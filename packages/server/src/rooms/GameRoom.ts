import { Room, logger, type Client } from "@colyseus/core";
import {
  GameState,
  PlayerState,
  RECONNECTION_WINDOW_SECONDS,
  ROOM_TTL_MS,
  type Role,
  type RoomPhase,
} from "@coop/shared";
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

  override async onCreate(): Promise<void> {
    this.maxClients = 2;

    // autoDispose detruirait la room des que le dernier client decroche, donc
    // instantanement en PAUSED. Le balayage est fait a la main par armTtl().
    this.autoDispose = false;

    this.roomId = await allocateRoomCode();
    this.setState(new GameState({ code: this.roomId, phase: "WAITING" }));

    // On ne rejoint que par code dicte : pas de listing public.
    await this.setPrivate(true);

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
    this.setPhase("PLAYING");
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
