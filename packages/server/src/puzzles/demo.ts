import {
  DEMO_PUZZLE_ID,
  type Action,
  type Role,
  type View,
} from "@coop/shared";

/**
 * Enigme bidon du jalon 2. Elle ne prouve rien sur le jeu, elle prouve la
 * plomberie : une intention de A traverse le serveur et ne ressort que chez B.
 *
 * Ce n'est PAS un PuzzleModule au sens de CLAUDE.md section 3 : ni `solve`,
 * ni `metrics`, ni generation par seed. Le moteur arrive au jalon 3.
 */

/**
 * Instance de l'enigme. Elle vit exclusivement cote serveur : elle n'est ni
 * dans le Schema synchronise, ni dans aucun message. Les joueurs n'en voient
 * que ce que `viewFor` leur en montre.
 */
export interface DemoInstance {
  /** Etat de la lampe. A ne doit jamais pouvoir le deduire. */
  lit: boolean;
  /** B a valide alors que la lampe etait allumee. */
  confirmed: boolean;
}

/** Ce que le serveur repond a l'auteur d'une intention. */
export interface Feedback {
  kind: "accepted" | "rejected";
  /**
   * Contrainte C2 de docs/puzzle-spec.md : un echec doit apprendre quelque
   * chose. Le motif du refus, jamais la reponse.
   */
  hint?: string;
}

export interface ApplyResult {
  instance: DemoInstance;
  feedback: Feedback;
}

export const demoPuzzle = {
  id: DEMO_PUZZLE_ID,

  generate(): DemoInstance {
    return { lit: false, confirmed: false };
  },

  /**
   * Le filtre. Tout ce qui n'est pas ici ne quitte jamais le serveur.
   *
   * La vue de A ne contient rien de derivable : pas de compteur de pressions,
   * dont la parite donnerait l'etat de la lampe.
   */
  viewFor(role: Role, instance: DemoInstance): View {
    return role === "A"
      ? { kind: "button" }
      : { kind: "light", lit: instance.lit };
  },

  /**
   * Autorite serveur : c'est ici qu'on decide si une intention est legitime.
   * Un joueur qui envoie l'action de l'autre role est refuse.
   */
  applyAction(
    instance: DemoInstance,
    role: Role,
    action: Action,
  ): ApplyResult {
    if (action.type === "press") {
      if (role !== "A") {
        return { instance, feedback: rejet("Cette commande n'est pas la votre.") };
      }
      return {
        instance: { ...instance, lit: !instance.lit },
        feedback: { kind: "accepted" },
      };
    }

    if (action.type === "confirm") {
      if (role !== "B") {
        return { instance, feedback: rejet("Cette commande n'est pas la votre.") };
      }
      if (!instance.lit) {
        return { instance, feedback: rejet("Rien a consigner : le voyant est eteint.") };
      }
      return {
        instance: { ...instance, confirmed: true },
        feedback: { kind: "accepted" },
      };
    }

    return { instance, feedback: rejet("Commande inconnue.") };
  },

  isSolved(instance: DemoInstance): boolean {
    return instance.confirmed;
  },
};

function rejet(hint: string): Feedback {
  return { kind: "rejected", hint };
}
