# Prompt d'amorçage

À coller dans Claude Code, dans un dépôt vide contenant déjà `CLAUDE.md`,
`docs/`, `schema/` et `content/dev/`.

---

## Session 1 — infrastructure

```
Lis CLAUDE.md, docs/architecture.md, docs/puzzle-spec.md et
schema/puzzle.schema.json avant toute chose. La règle du mur anti-spoil
en section 1 de CLAUDE.md s'applique à partir de maintenant et pour
toutes les sessions futures.

Objectif de cette session : jalon 1 et 2 de docs/architecture.md.

1. Scaffold : pnpm workspace, packages server (Node 20 + TS + Colyseus)
   et client (React + Vite + TS), package shared pour les types du
   protocole.
2. Lobby : création de room avec code 4 lettres (alphabet sans I O L 0 1),
   rejointe par code, affichage "2/2 connectés".
3. Énigme bidon prouvant la boucle : un bouton chez A, une lumière chez B.
   Le client A envoie une intention, le serveur valide, le serveur pousse
   une vue mise à jour à B seul.
4. Un test qui échoue si l'état complet de la room, la vue de l'autre
   joueur, ou quoi que ce soit de content/prod se retrouve dans ce qui est
   envoyé à un client.

Ne code pas d'énigme réelle. N'ouvre pas content/prod. Ne génère aucun
contenu narratif.

Quand c'est fini : commande pour lancer les deux clients en local, et
liste des choix d'implémentation que tu as tranchés seul.
```

---

## Session 2 — reconnexion

```
Jalon 3 de docs/architecture.md : reconnexion complète et balayage des
rooms mortes. Token en sessionStorage, allowReconnection 300s, état
intégralement restauré y compris le chat. Un refresh de page est le cas
nominal.

Ajoute un test d'intégration qui simule une déconnexion en cours de
partie et vérifie que rien n'est perdu au retour.
```

---

## Session 3 — moteur d'énigmes

```
Implémente le PuzzleModule décrit en section 3 de CLAUDE.md, le loader de
contenu (section 6 de docs/architecture.md), et le harnais de test des
quatre obligations de vérification (section 4 de CLAUDE.md).

Fais tourner le tout sur content/dev/room-01-fixture.json.

Le test d'asymétrie est le plus important : il doit prouver qu'il existe
deux instances distinctes produisant la même vue A avec des solutions
différentes, et idem pour B. Prends le temps de le faire correctement.

Toujours aucune énigme réelle.
```

---

## Session 4 — la première vraie salle

```
Maintenant tu peux générer du contenu réel.

Lis docs/world-bible.md pour le registre. Crée content/prod/ avec le
chiffrement décrit en section 2 de CLAUDE.md, le .gitattributes, et le
.gitignore.

Écris la salle 1 : primitive LEXIQUE seule, correspondance 1:1, 6 à 7
glyphes, budget 5-7 éléments discrets, 2-4 minutes. Génération par seed,
déterministe. Les glyphes ne portent aucun nom dans l'UI.

Écris aussi la trame narrative complète des cinq salles et la nature du
retournement de la salle 5, dans content/prod/. Tu es le seul à la
connaître. Elle doit tenir la contrainte de la world bible : le
retournement est mécanique ET narratif, la même inversion sert les deux.

Les quatre tests doivent passer. Rends-moi uniquement le rapport sans
spoil au format de la section 5 de CLAUDE.md.

Rappel : je vais jouer à ce jeu. Ne me dis rien de ce que tu viens
d'écrire.
```

---

## Sessions suivantes

```
Salle N. Primitives et cibles selon le tableau de docs/puzzle-spec.md
section 3 et 5. Respecte la règle de continuité du lexique. Les quatre
tests verts, puis le rapport sans spoil.
```

---

## Note

Après la session 4, fais tester la salle 1 par un duo qui n'est ni toi ni
ton partenaire de jeu, et demande-leur un retour de forme uniquement
(« la 1 est trop facile », « l'info de B est ambiguë »). C'est ton seul
QA réel, puisque tu ne peux plus relire le contenu.
