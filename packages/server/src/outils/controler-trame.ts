import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dechiffrer, cleContenu } from "../content/loader";
import { chargerEnv, RACINE } from "./env";

/**
 * Controle la trame narrative sans jamais l'afficher.
 *
 *   pnpm --filter @coop/server content:controler-trame
 *
 * La trame est ecrite par quelqu'un dont on ne relira jamais le travail. Sa
 * conformite ne peut donc pas etre verifiee a l'oeil : elle doit l'etre par
 * programme. Ce fichier dechiffre en memoire, verifie, et ne rend que des
 * verdicts — jamais un mot du texte.
 */

const CHEMIN = join(RACINE, "content/prod/trame.enc");
const SALLES_ATTENDUES = 5;
const MOTS_MAX = 40;
const LABEL_MAX = 40;

/** Les deux inversions structurellement valides. docs/puzzle-spec.md section 3. */
const INVERSIONS = ["ROLES_ECHANGES", "LEXIQUE_INVERSE"];

/**
 * Vocabulaire proscrit par docs/world-bible.md section 4 : « vocabulaire de
 * fantasy generique, ca affadit tout ».
 */
const FADE = ["démon", "demon", "malédiction", "malediction", "âme", "ame", "portail", "artefact", "ancien mal"];

/**
 * docs/world-bible.md section 3 : « ne jamais nommer une religion reelle ».
 * Le vocabulaire est liturgique, pas confessionnel.
 */
const CONFESSIONNEL = [
  "catholique", "chrétien", "chretien", "christ", "jésus", "jesus",
  "islam", "musulman", "coran", "allah", "juif", "judaïsme", "judaisme",
  "torah", "bouddh", "hindou", "église", "eglise", "mosquée", "mosquee",
  "synagogue", "temple", "pape", "évangile", "evangile", "bible",
];

interface Salle {
  room?: number;
  roomLabel?: string;
  ambientText?: string;
  beat?: string;
}

interface Trame {
  version?: number;
  salles?: Salle[];
  inversion?: { mecanique?: string; justification?: string; indices?: string[] };
  fin?: string;
}

const verdicts: { libelle: string; ok: boolean; detail?: string }[] = [];
const juger = (libelle: string, ok: boolean, detail?: string): void => {
  verdicts.push({ libelle, ok, ...(detail ? { detail } : {}) });
};

chargerEnv();
if (!process.env["CONTENT_KEY"]) {
  console.error("CONTENT_KEY absente.");
  process.exit(1);
}

const trame = JSON.parse(dechiffrer(readFileSync(CHEMIN), cleContenu())) as Trame;

const salles = Array.isArray(trame.salles) ? trame.salles : [];
const tout = [
  ...salles.flatMap((s) => [s.roomLabel, s.ambientText, s.beat]),
  trame.inversion?.justification,
  ...(trame.inversion?.indices ?? []),
  trame.fin,
]
  .filter((t): t is string => typeof t === "string")
  .join("\n")
  .toLowerCase();

juger("version connue", trame.version === 1);
juger(
  `${SALLES_ATTENDUES} salles, numerotees 1 a ${SALLES_ATTENDUES}`,
  salles.length === SALLES_ATTENDUES &&
    salles.every((s, i) => s.room === i + 1),
  `${salles.length} trouvee(s)`,
);

juger(
  "chaque salle a un libelle, une ambiance et un beat",
  salles.every(
    (s) =>
      typeof s.roomLabel === "string" &&
      s.roomLabel.trim().length > 0 &&
      typeof s.ambientText === "string" &&
      s.ambientText.trim().length > 0 &&
      typeof s.beat === "string" &&
      s.beat.trim().length > 0,
  ),
);

const tropLongs = salles.filter(
  (s) => (s.ambientText ?? "").trim().split(/\s+/).length > MOTS_MAX,
).length;
juger(
  `aucune ambiance ne depasse ${MOTS_MAX} mots`,
  tropLongs === 0,
  `${tropLongs} en trop`,
);

const labelsLongs = salles.filter(
  (s) => (s.roomLabel ?? "").length > LABEL_MAX,
).length;
juger(`aucun libelle ne depasse ${LABEL_MAX} caracteres`, labelsLongs === 0);

juger(
  "l'inversion de la salle 5 est une des deux formes implementables",
  INVERSIONS.includes(trame.inversion?.mecanique ?? ""),
);
juger(
  "l'inversion est justifiee et adossee a au moins deux indices",
  (trame.inversion?.justification ?? "").trim().length > 0 &&
    (trame.inversion?.indices?.length ?? 0) >= 2,
);
juger("une fin, et une seule", (trame.fin ?? "").trim().length > 0);

const fades = FADE.filter((mot) => tout.includes(mot));
juger(
  "aucun mot de fantasy generique",
  fades.length === 0,
  `${fades.length} occurrence(s)`,
);

const confessions = CONFESSIONNEL.filter((mot) => tout.includes(mot));
juger(
  "aucune religion reelle nommee",
  confessions.length === 0,
  `${confessions.length} occurrence(s)`,
);

// Rien de ce qui suit ne cite la trame : uniquement des verdicts.
for (const v of verdicts) {
  const detail = v.detail && !v.ok ? ` — ${v.detail}` : "";
  console.log(`${v.ok ? "OK  " : "ECHEC"} ${v.libelle}${detail}`);
}

const echecs = verdicts.filter((v) => !v.ok).length;
console.log(
  echecs === 0
    ? `\n${verdicts.length} controles, tous verts.`
    : `\n${echecs} controle(s) en echec sur ${verdicts.length}.`,
);
process.exit(echecs === 0 ? 0 : 1);
