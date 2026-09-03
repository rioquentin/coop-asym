import { useState, type FormEvent, type ReactNode } from "react";
import {
  ROOM_CODE_LENGTH,
  isRoomCode,
  normalizeRoomCode,
  type Action,
  type Glyphe,
  type GridView,
  type LegendView,
} from "@coop/shared";
import {
  useGame,
  type Feedback,
  type Game,
  type Salle,
  type Snapshot,
} from "./net/useGame";

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
    const commun = {
      feedback: game.feedback,
      salle: game.salle,
      onAct: game.act,
    };
    return game.view.kind === "grid" ? (
      <Plateau view={game.view} {...commun} onLeave={game.leaveRoom} />
    ) : (
      <Registre view={game.view} {...commun} onLeave={game.leaveRoom} />
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
 * Le trace d'un glyphe. Aucun texte : la world bible interdit de legender un
 * glyphe, le duo doit inventer ses propres noms.
 *
 * Le contenu de developpement n'a pas de trace ; on retombe alors sur
 * l'identifiant, qui y est volontairement lisible.
 */
function TraceGlyphe({ glyphe }: { glyphe: Glyphe }) {
  if (!glyphe.d) return <span className="glyphe-texte">{glyphe.id}</span>;
  return (
    <svg className="trace" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d={glyphe.d}
        fill="none"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface PosteProps {
  feedback: Feedback | null;
  salle: Salle | null;
  onAct: (action: Action) => void;
  onLeave: () => void;
}

/**
 * L'habillage de la salle : son nom et son texte d'ambiance.
 *
 * Il ne porte jamais d'indice de resolution (world bible section 5), donc un
 * joueur qui ne le lit pas n'est pas puni. Il est identique pour les deux
 * roles : c'est du decor, pas de l'information.
 */
function Ambiance({ salle }: { salle: Salle | null }) {
  if (!salle?.label && !salle?.ambient) return null;
  return (
    <header className="ambiance">
      {salle.label && <p className="salle">{salle.label}</p>}
      {salle.ambient && <p className="ambiant">{salle.ambient}</p>}
    </header>
  );
}

/**
 * Poste de A : les glyphes et les cases.
 *
 * A ne sait pas ce que ses glyphes veulent dire, ni dans quel ordre ils vont.
 * Rien dans ce composant ne peut le lui apprendre : il ne recoit que `view`.
 */
function Plateau({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: GridView }) {
  const [choisi, setChoisi] = useState<number | null>(null);

  const estPose = (index: number): boolean =>
    view.slots.some((pose) => pose?.id === view.tray[index]?.id);

  function cliquerCase(position: number): void {
    if (view.slots[position] !== null) {
      onAct({ type: "clear", slot: position });
      return;
    }
    if (choisi === null) return;
    onAct({ type: "place", from: choisi, to: position });
    setChoisi(null);
  }

  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Planche</h1>
      <p className="muted">
        Choisissez un glyphe, puis la case ou le porter. Cliquez une case
        remplie pour la vider.
      </p>

      <p className="label">Glyphes</p>
      <div className="rangee">
        {view.tray.map((glyphe, index) => (
          <button
            key={glyphe.id}
            type="button"
            className={`glyphe${choisi === index ? " choisi" : ""}`}
            disabled={estPose(index)}
            onClick={() => setChoisi(index)}
          >
            <TraceGlyphe glyphe={glyphe} />
          </button>
        ))}
      </div>

      <p className="label">Cases</p>
      <div className="rangee">
        {view.slots.map((glyphe, position) => (
          <button
            key={position}
            type="button"
            className={`case${glyphe ? " remplie" : ""}`}
            onClick={() => cliquerCase(position)}
          >
            <span className="rang">{position + 1}</span>
            {glyphe ? <TraceGlyphe glyphe={glyphe} /> : null}
          </button>
        ))}
      </div>

      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Poste de B : le sens des glyphes et le releve a obtenir.
 *
 * B sait quoi mettre ou. Il ne voit pas la planche de A, donc il ne peut pas
 * designer un glyphe par sa position : il doit le decrire.
 */
function Registre({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: LegendView }) {
  const sensParGlyphe = new Map(
    view.legend.map(([glyphe, sens]) => [glyphe.id, sens]),
  );

  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Registre</h1>
      <p className="muted">
        Vous seul avez le sens des glyphes et l'ordre du releve. Vous ne pouvez
        rien poser.
      </p>

      <p className="label">Releve attendu</p>
      <ol className="releve">
        {view.target.map((sens, position) => {
          const pose = view.slots[position];
          const juste = pose ? sensParGlyphe.get(pose.id) === sens : false;
          return (
            <li key={position} className={juste ? "juste" : undefined}>
              <span className="attendu">{sens}</span>
              <span className="pose">
                {pose ? <TraceGlyphe glyphe={pose} /> : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="label">Legende</p>
      <ul className="legende">
        {view.legend.map(([glyphe, sens]) => (
          <li key={glyphe.id}>
            <span className="glyphe-nom">
              <TraceGlyphe glyphe={glyphe} />
            </span>
            <span className="sens">{sens}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="primary"
        onClick={() => onAct({ type: "validate" })}
      >
        Consigner
      </button>

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
  if (feedback.kind === "accepted") return <p className="phase">Enregistre.</p>;
  return <p className="phase error">{feedback.hint ?? "Refuse."}</p>;
}

function Fin({ onLeave }: { onLeave: () => void }) {
  return (
    <main className="sheet">
      <h1>Dossier clos</h1>
      <p className="muted">Le releve est conforme.</p>
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
