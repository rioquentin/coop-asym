import { useState, type FormEvent, type ReactNode } from "react";
import { ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "@coop/shared";
import { useGame, type Feedback, type Game, type Snapshot } from "./net/useGame";

export function App() {
  const game = useGame();

  if (game.status === "restoring") {
    return <Centered>Reprise de la session...</Centered>;
  }
  if (game.status === "connecting") {
    return <Centered>Connexion...</Centered>;
  }
  if (game.status === "connected" && game.snapshot) {
    return <Session game={game} snapshot={game.snapshot} />;
  }
  return (
    <Home error={game.error} onCreate={game.createRoom} onJoin={game.joinRoom} />
  );
}

/** Aiguillage entre le lobby, le poste de travail et l'ecran de fin. */
function Session({ game, snapshot }: { game: Game; snapshot: Snapshot }) {
  if (game.finished || snapshot.phase === "FINISHED") {
    return <Fin onLeave={game.leaveRoom} />;
  }
  if (snapshot.phase === "PLAYING" && game.view) {
    return (
      <Poste
        view={game.view}
        feedback={game.feedback}
        onAct={game.act}
        onLeave={game.leaveRoom}
      />
    );
  }
  return <Lobby snapshot={snapshot} onLeave={game.leaveRoom} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="sheet">
      <p className="muted">{children}</p>
    </main>
  );
}

function Home({
  error,
  onCreate,
  onJoin,
}: {
  error: string | null;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const normalized = normalizeRoomCode(code);
  const canJoin = isRoomCode(normalized);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canJoin) onJoin(normalized);
  }

  return (
    <main className="sheet">
      <h1>Depot</h1>
      <p className="muted">Deux preposes. Une seule moitie du dossier chacun.</p>

      <button type="button" className="primary" onClick={onCreate}>
        Ouvrir un dossier
      </button>

      <div className="rule">
        <span>ou</span>
      </div>

      <form onSubmit={submit}>
        <label htmlFor="code">Cote du dossier</label>
        <input
          id="code"
          value={code}
          onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
          maxLength={ROOM_CODE_LENGTH}
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX"
        />
        <button type="submit" disabled={!canJoin}>
          Rejoindre
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Lobby({
  snapshot,
  onLeave,
}: {
  snapshot: Snapshot;
  onLeave: () => void;
}) {
  const self = snapshot.players.find(
    (player) => player.sessionId === snapshot.selfSessionId,
  );
  const partner = snapshot.players.find(
    (player) => player.sessionId !== snapshot.selfSessionId,
  );

  return (
    <main className="sheet">
      <h1>Depot</h1>

      <p className="label">Cote du dossier</p>
      <p className="code">{snapshot.code}</p>
      <p className="muted">A dicter a l'autre prepose.</p>

      <p className="count">{snapshot.players.length}/2 connectes</p>

      <ul className="roster">
        <li>Vous{self?.role ? ` — prepose ${self.role}` : ""}</li>
        <li className={partner?.connected === false ? "offline" : undefined}>
          {partner
            ? partner.connected
              ? `Second prepose${partner.role ? ` — prepose ${partner.role}` : ""}`
              : "Second prepose — hors ligne"
            : "Second prepose — absent"}
        </li>
      </ul>

      <p className="phase">{describePhase(snapshot)}</p>

      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Le poste de travail : la moitie du dispositif que CE joueur a sous les yeux.
 *
 * Le composant ne connait que `view`. Il n'a aucun moyen de savoir ce que voit
 * l'autre, ni si son geste rapproche de la fin — c'est le serveur qui repond.
 */
function Poste({
  view,
  feedback,
  onAct,
  onLeave,
}: {
  view: Game["view"];
  feedback: Feedback | null;
  onAct: Game["act"];
  onLeave: () => void;
}) {
  if (!view) return null;

  return (
    <main className="sheet">
      <h1>{view.kind === "button" ? "Commutateur" : "Voyant"}</h1>

      {view.kind === "button" ? (
        <>
          <p className="muted">
            Le commutateur n'indique rien. Son effet se lit ailleurs.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => onAct({ type: "press" })}
          >
            Actionner
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Le voyant ne dit pas d'ou vient son courant.
          </p>
          <p className={view.lit ? "lampe allumee" : "lampe"}>
            {view.lit ? "ALLUME" : "ETEINT"}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => onAct({ type: "confirm" })}
          >
            Consigner
          </button>
        </>
      )}

      <FeedbackLine feedback={feedback} />

      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Retour du serveur sur la derniere intention. Un refus dit POURQUOI, jamais
 * la reponse — contrainte C2 de docs/puzzle-spec.md.
 */
function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return <p className="phase">&nbsp;</p>;
  if (feedback.kind === "accepted") {
    return <p className="phase">Consigne.</p>;
  }
  return <p className="phase error">{feedback.hint ?? "Refuse."}</p>;
}

function Fin({ onLeave }: { onLeave: () => void }) {
  return (
    <main className="sheet">
      <h1>Dossier clos</h1>
      <p className="muted">
        La boucle a tenu : une intention, un serveur, deux vues distinctes.
      </p>
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

function describePhase(snapshot: Snapshot): string {
  switch (snapshot.phase) {
    case "WAITING":
      return "En attente du second prepose.";
    case "PLAYING":
      return "Dossier ouvert.";
    case "PAUSED":
      return "Dossier suspendu : un prepose s'est absente.";
    case "FINISHED":
      return "Dossier clos.";
  }
}
