import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CHAT_MAX_CARACTERES,
  ROOM_CODE_LENGTH,
  isRoomCode,
  normalizeRoomCode,
  DIRECTIONS,
  type Action,
  type Direction,
  type Glyphe,
  type GridView,
  type LegendView,
  type ArpentView,
  type ClavierView,
  type LitanieView,
  type PlanView,
  type PosteView,
  type ReleveView,
  type Touche,
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
  const role =
    snapshot.players.find((j) => j.sessionId === snapshot.selfSessionId)?.role ??
    "";

  return (
    <div className="pile">
      <Poste game={game} snapshot={snapshot} />
      {role && <Chat snapshot={snapshot} role={role} onDire={game.dire} />}
    </div>
  );
}

function Poste({ game, snapshot }: { game: Game; snapshot: Snapshot }) {
  if (game.finished || snapshot.phase === "FINISHED") {
    return <Fin onLeave={game.leaveRoom} />;
  }
  if (snapshot.phase === "PLAYING" && game.view) {
    const commun = {
      feedback: game.feedback,
      salle: game.salle,
      onAct: game.act,
    };
    switch (game.view.kind) {
      case "grid":
        return <Plateau view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "legend":
        return <Registre view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "plan":
        return <Plan view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "poste":
        return <Aveugle view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "releve":
        return <Releve view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "arpent":
        return <Arpent view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "litanie":
        return <Litanie view={game.view} {...commun} onLeave={game.leaveRoom} />;
      case "clavier":
        return (
          <ClavierDesFormes view={game.view} {...commun} onLeave={game.leaveRoom} />
        );
    }
  }
  return <Lobby snapshot={snapshot} onLeave={game.leaveRoom} />;
}

/**
 * Le chat en jeu.
 *
 * Il vit dans l'etat synchronise, donc une reconnexion le rend intact sans que
 * le client redemande quoi que ce soit. Le serveur decide de qui vient chaque
 * ligne : ce composant n'annonce jamais son propre role.
 *
 * Les joueurs sont sur Discord ; ce chat sert a ce qui se transcrit mal a
 * l'oral — une suite de signes, un ordre a relire.
 */
function Chat({
  snapshot,
  role,
  onDire,
}: {
  snapshot: Snapshot;
  role: string;
  onDire: (text: string) => void;
}) {
  const [texte, setTexte] = useState("");
  const lignes = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const liste = lignes.current;
    if (liste) liste.scrollTop = liste.scrollHeight;
  }, [snapshot.chat.length]);

  function envoyer(event: FormEvent): void {
    event.preventDefault();
    const dit = texte.trim();
    if (dit.length === 0) return;
    onDire(dit);
    setTexte("");
  }

  return (
    <section className="sheet chat">
      <p className="label">Transcription</p>

      <ol className="lignes" ref={lignes}>
        {snapshot.chat.length === 0 && (
          <li className="muted">Rien n'a encore ete consigne.</li>
        )}
        {snapshot.chat.map((ligne, rang) => (
          <li key={rang} className={ligne.from === role ? "de-vous" : undefined}>
            <span className="qui">{ligne.from}</span>
            <span className="quoi">{ligne.text}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={envoyer} className="dire">
        <input
          value={texte}
          onChange={(event) => setTexte(event.target.value)}
          maxLength={CHAT_MAX_CARACTERES}
          autoComplete="off"
          placeholder="Consigner une note"
          aria-label="Consigner une note"
        />
        <button type="submit" disabled={texte.trim().length === 0}>
          Consigner
        </button>
      </form>
    </section>
  );
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
      {/*
        Le papier est deja le filet du duo : ce qui se transmet d'une salle a
        l'autre ne se retient pas de tete, et un couple qui a oublie glisse
        vers la devinette parce qu'une erreur ne coute presque rien. On ne
        rattrape pas ca par une mecanique, on l'assume par une phrase. Voir D66.
      */}
      <p className="muted">Prenez de quoi ecrire. Vous en aurez besoin.</p>

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

/** Cote d'une case du plan, en unites SVG. */
const COTE = 44;

/**
 * Poste de A en salle 2 : le plan, et pas son partenaire.
 *
 * A voit chaque mur et sait ou est le depot. Rien ici ne lui dit ou se trouve
 * B — c'est tout le probleme, et c'est ce qui l'oblige a ecouter.
 */
function Plan({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: PlanView }) {
  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Plan</h1>
      <p className="muted">
        Vous voyez le lieu, pas votre partenaire. Cliquez une case pour y poser
        le jalon : il le sentira sous ses pieds en y passant.
      </p>

      <Grille
        largeur={view.largeur}
        hauteur={view.hauteur}
        murs={view.murs}
        onCase={(x, y) => onAct({ type: "jalonner", x, y })}
        decor={(x, y) => (
          <>
            {view.depot.x === x && view.depot.y === y && (
              <rect
                className="depot"
                x={x * COTE + 13}
                y={y * COTE + 13}
                width={COTE - 26}
                height={COTE - 26}
              />
            )}
            {view.jalon?.x === x && view.jalon.y === y && (
              <circle
                className="jalon"
                cx={x * COTE + COTE / 2}
                cy={y * COTE + COTE / 2}
                r={4}
              />
            )}
          </>
        )}
      />

      <button
        type="button"
        className="primary"
        onClick={() => onAct({ type: "sceller" })}
      >
        Sceller le depot
      </button>

      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

const LIBELLE_DIRECTION: Record<Direction, string> = {
  nord: "Nord",
  est: "Est",
  sud: "Sud",
  ouest: "Ouest",
};

/**
 * Le lieu vu d'en haut : les murs, et ce que l'appelant veut y poser.
 *
 * Partage par la salle 2 et la salle 3 — c'est le meme lieu vu par le meme
 * role, seul change ce qu'on y marque.
 */
function Grille({
  largeur,
  hauteur,
  murs,
  onCase,
  decor,
}: {
  largeur: number;
  hauteur: number;
  murs: Direction[][];
  onCase?: (x: number, y: number) => void;
  decor?: (x: number, y: number) => ReactNode;
}) {
  return (
    <svg
      className="plan"
      viewBox={[0, 0, largeur * COTE, hauteur * COTE].join(" ")}
    >
      {murs.map((cotes, index) => {
        const x = index % largeur;
        const y = Math.floor(index / largeur);
        const gauche = x * COTE;
        const haut = y * COTE;
        const droite = gauche + COTE;
        const bas = haut + COTE;
        return (
          <g key={index}>
            <rect
              className={onCase ? "case-plan" : undefined}
              x={gauche}
              y={haut}
              width={COTE}
              height={COTE}
              fill="transparent"
              onClick={onCase ? () => onCase(x, y) : undefined}
            />
            {decor?.(x, y)}
            {cotes.includes("nord") && (
              <line className="mur" x1={gauche} y1={haut} x2={droite} y2={haut} />
            )}
            {cotes.includes("ouest") && (
              <line className="mur" x1={gauche} y1={haut} x2={gauche} y2={bas} />
            )}
            {cotes.includes("sud") && (
              <line className="mur" x1={gauche} y1={bas} x2={droite} y2={bas} />
            )}
            {cotes.includes("est") && (
              <line className="mur" x1={droite} y1={haut} x2={droite} y2={bas} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Les quatre issues d'une case, en croix. */
function Rose({
  ouvertures,
  onAvancer,
}: {
  ouvertures: Direction[];
  onAvancer: (direction: Direction) => void;
}) {
  return (
    <div className="rose">
      {DIRECTIONS.map((direction) => {
        const ouvert = ouvertures.includes(direction);
        return (
          <button
            key={direction}
            type="button"
            className={`issue ${direction}${ouvert ? "" : " muree"}`}
            disabled={!ouvert}
            onClick={() => onAvancer(direction)}
          >
            {LIBELLE_DIRECTION[direction]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Poste de A en salle 3 : le plan, ou l'on a grave, et l'ordre du releve.
 *
 * A sait QUE des gravures existent et dans quel ordre les significations
 * doivent tomber. Il ne sait pas LAQUELLE porte quoi — seul son partenaire
 * voit les formes, et seul le lexique appris en salle 1 relie les deux.
 */
function Releve({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: ReleveView }) {
  const marquee = new Set(view.marques.map(({ x, y }) => `${x},${y}`));

  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Registre du lieu</h1>
      <p className="muted">
        Vous savez ou l'on a grave, jamais quoi. Votre partenaire voit les
        formes ; a vous de reconnaitre leur sens.
      </p>

      <Grille
        largeur={view.largeur}
        hauteur={view.hauteur}
        murs={view.murs}
        decor={(x, y) =>
          marquee.has(`${x},${y}`) ? (
            <circle
              className="gravure"
              cx={x * COTE + COTE / 2}
              cy={y * COTE + COTE / 2}
              r={6}
            />
          ) : null
        }
      />

      <p className="label">Ordre du releve</p>
      <ol className="releve">
        {view.attendus.map((sens, rang) => (
          <li key={rang} className={rang < view.progres ? "juste" : undefined}>
            <span className="attendu">{sens}</span>
            <span className="pose">{rang < view.progres ? "consigne" : "—"}</span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="primary"
        onClick={() => onAct({ type: "sceller" })}
      >
        Sceller le releve
      </button>

      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Poste de B en salle 3 : la forme sous les pieds, et les issues.
 *
 * B voit la gravure, jamais son sens. Le sens, il l'a appris en salle 1.
 */
function Arpent({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: ArpentView }) {
  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Dalles</h1>
      <p className="muted">
        Vous ne voyez que cette case. Nommez ce qui y est grave.
      </p>

      <div className="gravure-au-sol">
        {view.grave ? (
          <TraceGlyphe glyphe={view.grave} />
        ) : (
          <p className="muted">La dalle est nue.</p>
        )}
      </div>

      <button
        type="button"
        className="primary"
        disabled={!view.grave}
        onClick={() => onAct({ type: "relever" })}
      >
        Relever
      </button>

      <Rose
        ouvertures={view.ouvertures}
        onAvancer={(direction) => onAct({ type: "avancer", direction })}
      />

      <p className="phase">{view.progres} releve(s) consigne(s).</p>

      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Poste de B en salle 2 : une case, et les cotes par lesquels on en sort.
 *
 * Ni plan, ni coordonnees. B sait quand il est arrive, jamais ou il est.
 */
function Aveugle({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: PosteView }) {
  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Coursive</h1>
      <p className="muted">
        Vous ne voyez que cette case. Decrivez ce que vous avez autour de vous.
      </p>

      <Rose
        ouvertures={view.ouvertures}
        onAvancer={(direction) => onAct({ type: "avancer", direction })}
      />

      <ul className="sensations">
        {/*
          Le sol ne dit plus rien de l'arrivee : c'est A qui reconnait le lieu
          a ce que B lui en decrit. Voir D71.
        */}
        <li>Le sol est nu.</li>
        {view.surLeJalon && <li className="juste">Un jalon sous vos pieds.</li>}
      </ul>

      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Une touche, quelle que soit sa monnaie : une signification ou une forme.
 *
 * Un poste peut tenir l'une ou l'autre monnaie selon la salle ; ce composant
 * est le seul endroit du client qui ait a le savoir.
 */
function ToucheRendue({ touche }: { touche: Touche }) {
  return touche.genre === "forme" ? (
    <TraceGlyphe glyphe={touche.forme} />
  ) : (
    <span className="sens-touche">{touche.sens}</span>
  );
}

/** Une touche est la meme quel que soit son cote : on la compare par sa clef. */
function clefDeTouche(touche: Touche): string {
  return touche.genre === "forme" ? touche.forme.id : touche.sens;
}

/** Etat du tour engage, commun aux deux postes des salles 4 et 5. */
function Passe({
  engage,
  progres,
  total,
  partenairePret,
  votreEngagement,
  dernierTour,
}: {
  engage: boolean;
  progres: number;
  total: number;
  partenairePret: boolean;
  votreEngagement: number | null;
  dernierTour: "reussi" | "manque" | null;
}) {
  return (
    <ul className="passe">
      <li>
        {progres}/{total} signes consignes.
      </li>
      <li className={engage ? "juste" : undefined}>
        {engage ? "Le mecanisme tourne." : "Le mecanisme est au repos."}
      </li>
      {engage && (
        <>
          <li>
            {votreEngagement === null
              ? "Vous n'avez rien engage sur ce tour."
              : "Vous vous etes engage. En attente."}
          </li>
          <li className={partenairePret ? "juste" : undefined}>
            {partenairePret
              ? "L'autre poste s'est engage."
              : "L'autre poste n'a rien engage."}
          </li>
        </>
      )}
      {dernierTour === "manque" && (
        <li className="rate">Le dernier tour n'a pas mordu.</li>
      )}
    </ul>
  );
}

/**
 * Poste de A en salle 4 : la suite a emettre, et un clavier de significations.
 *
 * La suite disparait des que le mecanisme est arme. Ce qui n'a pas ete
 * memorise avant est perdu jusqu'au relachement — et relacher ne coute rien.
 */
function Litanie({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: LitanieView }) {
  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Litanie</h1>
      <p className="muted">
        Dictez la suite avant d'armer. Une fois le mecanisme lance, elle
        disparait — et vous vous engagez sans voir ce que l'autre engage.
      </p>

      <p className="label">Suite a emettre</p>
      {view.suite ? (
        <ol className="suite">
          {view.suite.map((touche, rang) => (
            <li key={rang} className={rang < view.progres ? "juste" : undefined}>
              <ToucheRendue touche={touche} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted suite-masquee">
          Masquee tant que le mecanisme tourne.
        </p>
      )}

      <button
        type="button"
        onClick={() => onAct({ type: view.engage ? "relacher" : "engager" })}
      >
        {view.engage ? "Relacher" : "Armer le mecanisme"}
      </button>

      <p className="label">Vos touches</p>
      <div className="rangee">
        {view.clavier.map((touche, index) => (
          <button
            key={clefDeTouche(touche)}
            type="button"
            className={`touche${view.votreEngagement === index ? " choisi" : ""}`}
            disabled={!view.engage || view.votreEngagement !== null}
            onClick={() => onAct({ type: "presser", index })}
          >
            <ToucheRendue touche={touche} />
          </button>
        ))}
      </div>

      <Passe {...view} />
      <FeedbackLine feedback={feedback} />
      <button type="button" onClick={onLeave}>
        Quitter
      </button>
    </main>
  );
}

/**
 * Poste de B en salle 4 : un clavier de formes, et rien d'autre.
 *
 * B ne voit jamais la suite. Il n'a que ce que A lui a dit avant l'armement,
 * et la correspondance apprise en salle 1.
 */
function ClavierDesFormes({
  view,
  feedback,
  salle,
  onAct,
  onLeave,
}: PosteProps & { view: ClavierView }) {
  return (
    <main className="sheet">
      <Ambiance salle={salle} />
      <h1>Clavier</h1>
      <p className="muted">
        Vous ne voyez pas la suite. Engagez la forme convenue, sans voir ce que
        l'autre engage.
      </p>

      <div className="rangee">
        {view.clavier.map((touche, index) => (
          <button
            key={clefDeTouche(touche)}
            type="button"
            className={`touche${view.votreEngagement === index ? " choisi" : ""}`}
            disabled={!view.engage || view.votreEngagement !== null}
            onClick={() => onAct({ type: "presser", index })}
          >
            <ToucheRendue touche={touche} />
          </button>
        ))}
      </div>

      <Passe {...view} />
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
