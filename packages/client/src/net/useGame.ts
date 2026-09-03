import { useCallback, useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import {
  CLIENT_MESSAGE,
  GameState,
  ROOM_NAME,
  SERVER_MESSAGE,
  normalizeRoomCode,
  type Action,
  type ClientMessage,
  type RoomPhase,
  type ServerMessage,
  type View,
} from "@coop/shared";

/** Cle de stockage du jeton de reconnexion. sessionStorage : un onglet, une partie. */
const TOKEN_KEY = "coop-asym:reconnectionToken";

const ENDPOINT = import.meta.env["VITE_SERVER_URL"] ?? "ws://localhost:2567";

/** Le code de room est inconnu du matchmaker, ou la room est deja complete. */
const MATCHMAKE_INVALID_ROOM_ID = 522;

export interface PlayerSnapshot {
  sessionId: string;
  role: string;
  connected: boolean;
}

/**
 * Vue locale de l'etat PUBLIC de la room. Le client ne recoit rien d'autre :
 * pas d'instance d'enigme, pas la vue de l'autre joueur.
 */
export interface Snapshot {
  code: string;
  phase: RoomPhase;
  players: PlayerSnapshot[];
  selfSessionId: string;
}

export type Status = "restoring" | "idle" | "connecting" | "connected";

/** La salle en cours, telle que le serveur l'annonce. */
export interface Salle {
  room: number;
  label?: string;
  ambient?: string;
}

/** Dernier retour du serveur sur une intention envoyee. */
export interface Feedback {
  kind: "accepted" | "rejected";
  hint?: string;
}

export interface Game {
  status: Status;
  snapshot: Snapshot | null;
  error: string | null;
  /** La vue de CE joueur. Le client n'en connait jamais d'autre. */
  view: View | null;
  salle: Salle | null;
  feedback: Feedback | null;
  finished: boolean;
  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  act: (action: Action) => void;
}

function describeError(error: unknown): string {
  const code = (error as { code?: number } | undefined)?.code;
  if (code === MATCHMAKE_INVALID_ROOM_ID) {
    return "Aucune partie ouverte avec ce code.";
  }
  return "Connexion impossible. Le serveur est-il lance ?";
}

function toSnapshot(state: GameState, sessionId: string): Snapshot {
  const players: PlayerSnapshot[] = [];
  state.players.forEach((player, playerSessionId) => {
    players.push({
      sessionId: playerSessionId,
      role: player.role,
      connected: player.connected,
    });
  });
  return {
    code: state.code,
    phase: state.phase as RoomPhase,
    players,
    selfSessionId: sessionId,
  };
}

export function useGame(): Game {
  const clientRef = useRef<Client | null>(null);
  const roomRef = useRef<Room<unknown, GameState> | null>(null);
  /**
   * L'enigme en cours, apprise du serveur et jamais devinee : le client
   * renvoie l'identifiant qu'on lui a donne, il n'en connait aucun d'avance.
   */
  const puzzleIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<Status>("restoring");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [salle, setSalle] = useState<Salle | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);

  if (clientRef.current === null) {
    clientRef.current = new Client(ENDPOINT);
  }

  /** Branche les ecoutes sur une room fraichement rejointe. */
  const attach = useCallback((room: Room<unknown, GameState>) => {
    roomRef.current = room;
    sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);

    room.onStateChange((state) => {
      setSnapshot(toSnapshot(state, room.sessionId));
    });

    room.onMessage(SERVER_MESSAGE, (message: ServerMessage) => {
      switch (message.t) {
        case "view":
          puzzleIdRef.current = message.puzzleId;
          setView(message.view);
          return;
        case "feedback":
          setFeedback({ kind: message.kind, hint: message.hint });
          return;
        case "roomAdvance":
          setSalle({
            room: message.room,
            ...(message.label !== undefined ? { label: message.label } : {}),
            ...(message.ambient !== undefined
              ? { ambient: message.ambient }
              : {}),
          });
          return;
        case "finished":
          setFinished(true);
          return;
        default:
          return;
      }
    });

    room.onError((_code, message) => {
      setError(message ?? "Erreur serveur.");
    });

    room.onLeave(() => {
      sessionStorage.removeItem(TOKEN_KEY);
      roomRef.current = null;
      puzzleIdRef.current = null;
      setSnapshot(null);
      setView(null);
      setSalle(null);
      setFeedback(null);
      setFinished(false);
      setStatus("idle");
    });

    setError(null);
    setView(null);
    setSalle(null);
    setFeedback(null);
    setFinished(false);
    setStatus("connected");
  }, []);

  // Un refresh de page est le cas nominal, pas une erreur : on retente
  // toujours la reconnexion avant d'afficher l'accueil.
  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    clientRef.current
      ?.reconnect<GameState>(token, GameState)
      .then((room) => {
        if (cancelled) {
          void room.leave(false);
          return;
        }
        attach(room);
      })
      .catch(() => {
        if (cancelled) return;
        sessionStorage.removeItem(TOKEN_KEY);
        setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [attach]);

  const createRoom = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      attach(await clientRef.current!.create<GameState>(ROOM_NAME, {}, GameState));
    } catch (err) {
      setError(describeError(err));
      setStatus("idle");
    }
  }, [attach]);

  const joinRoom = useCallback(
    async (rawCode: string) => {
      setStatus("connecting");
      setError(null);
      try {
        attach(
          await clientRef.current!.joinById<GameState>(
            normalizeRoomCode(rawCode),
            {},
            GameState,
          ),
        );
      } catch (err) {
        setError(describeError(err));
        setStatus("idle");
      }
    },
    [attach],
  );

  const leaveRoom = useCallback(async () => {
    // consented = true : depart volontaire, pas de fenetre de reconnexion.
    await roomRef.current?.leave(true);
  }, []);

  /**
   * Envoie une INTENTION. Le client ne calcule rien : il ne sait meme pas si
   * l'action est legitime, c'est le serveur qui repond.
   */
  const act = useCallback((action: Action) => {
    const puzzleId = puzzleIdRef.current;
    if (!puzzleId) return;
    setFeedback(null);
    const message: ClientMessage = { t: "action", puzzleId, action };
    roomRef.current?.send(CLIENT_MESSAGE, message);
  }, []);

  return {
    status,
    snapshot,
    error,
    view,
    salle,
    feedback,
    finished,
    createRoom,
    joinRoom,
    leaveRoom,
    act,
  };
}
