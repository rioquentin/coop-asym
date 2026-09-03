# Architecture

Serveur autoritaire. Le client est un terminal bête.

---

## 1. Vue d'ensemble

```
client A (React/Vite) ─┐
                       ├─ WebSocket ─→ serveur Colyseus (Node 20 + TS)
client B (React/Vite) ─┘                  │
                                          ├─ registre des modules d'énigmes
                                          └─ content/ (dev en clair | prod chiffré)
```

Hébergement : process Node persistant (Railway, Fly.io, Render).
**Pas Vercel** — les fonctions serverless ne tiennent pas une connexion
WebSocket longue. Le front statique peut être hébergé où on veut.

---

## 2. Règle d'or : le filtrage se fait côté serveur

Le client ne reçoit **jamais** l'état complet de la room. À chaque
changement, le serveur calcule `viewFor(role, instance)` et n'envoie à
chaque joueur que sa propre vue.

Concrètement, avec Colyseus : ne pas mettre l'instance d'énigme dans le
`Schema` synchronisé. L'état partagé ne contient que ce qui est public
(joueurs connectés, salle courante, chat). Les vues partent en messages
ciblés via `client.send()`.

Un joueur qui ouvre le devtools, lit le trafic WebSocket ou fouille le
bundle ne doit rien apprendre de la vue de l'autre ni de la solution.
Prévoir un test qui échoue si `solve` ou `content/prod` se retrouve dans
le bundle client.

---

## 3. Cycle de vie d'une room

```
CREATED → WAITING (1/2) → PLAYING → FINISHED
                ↑              ↓
                └── PAUSED ────┘   (un joueur déconnecté)
```

- Code de room : 4 lettres, alphabet sans caractères ambigus
  (pas de I, O, L, 0, 1). Il sera dicté à l'oral, donc lisible.
- `WAITING` : TTL 15 min sans second joueur, puis destruction.
- `PAUSED` : TTL 5 min. Le jeu se fige, l'autre joueur voit un état
  d'attente explicite. Au-delà, la room est détruite.
- `FINISHED` : destruction après 2 min.
- Balayage périodique des rooms orphelines. À faire au premier jalon, pas
  après : une fuite de rooms est invisible en dev et fatale en prod.

L'attribution des rôles A/B se fait à l'entrée en `PLAYING` et ne change
plus, sauf inversion scriptée en salle 5.

---

## 4. Reconnexion

Obligatoire dès le jalon 1. Rétrofitter ça après coup est douloureux.

- À l'entrée, le serveur émet un `reconnectionToken` que le client stocke
  en `sessionStorage`.
- À la déconnexion, la room passe en `PAUSED` et l'état est conservé
  intégralement côté serveur, y compris la progression dans l'énigme en
  cours et l'historique du chat.
- Au retour, le token restaure le rôle **et** l'état exact. Le joueur
  ne doit rien reperdre.
- `allowReconnection(client, 300)` côté Colyseus.
- Un refresh de page est le cas nominal, pas une erreur. Testez-le à
  chaque jalon.

---

## 5. Protocole

Le client envoie des **intentions**, jamais des résultats.

```ts
// client → serveur
type ClientMessage =
  | { t: 'action'; puzzleId: string; action: Action }
  | { t: 'chat'; text: string }
  | { t: 'ready' }
  | { t: 'ping' };

// serveur → client
type ServerMessage =
  | { t: 'view'; puzzleId: string; role: 'A'|'B'; view: View }
  | { t: 'feedback'; kind: 'accepted'|'rejected'; hint?: string }
  | { t: 'roomAdvance'; room: number }
  | { t: 'partner'; status: 'connected'|'disconnected' }
  | { t: 'chat'; from: 'A'|'B'; text: string }
  | { t: 'finished' };
```

Interdits :
- un message `solved` envoyé par le client ;
- un message serveur contenant la solution, même partiellement ;
- un `hint` qui révèle la réponse plutôt que la nature de l'erreur.

`rejected` doit être **informatif et instantané** : le joueur apprend
quelque chose de son échec (contrainte C2 de la spec). Pas de délai
punitif, pas de reset.

---

## 6. Chargement du contenu

```ts
// dev  : content/dev/*.json en clair, hot reload
// prod : content/prod/*.enc, AES-256-GCM, clé via process.env.CONTENT_KEY
```

- En dev, `CONTENT_KEY` est absente et le loader refuse de lire `prod/`.
  Il jette une erreur explicite. Ça garantit qu'on ne charge pas le vrai
  contenu par accident pendant le développement.
- En prod, le déchiffrement se fait en mémoire au démarrage. Jamais
  d'écriture du contenu déchiffré sur disque.
- Les seeds de partie sont tirés au démarrage de chaque room. Un seed est
  loggable ; il ne révèle rien sans le générateur.

---

## 7. Jalons

Chaque ligne produit quelque chose de visible à l'écran.

1. **Lobby** — créer une room, rejoindre par code, « 2/2 connectés ».
2. **Boucle réseau** — énigme bidon : un bouton chez A, une lumière chez B.
   Prouve le filtrage des vues et l'autorité serveur.
3. **Reconnexion** — refresh d'un joueur, restauration complète. Balayage
   des rooms mortes.
4. **Salle 1 complète** — les deux vraies vues, victoire, écran de fin.
   **Point de bascule : c'est là qu'on fait tester à un duo externe.**
5. **Salles 2 à 5** — une par cycle, chacune testée avant la suivante.
6. **Habillage** — passe visuelle, puis déploiement (itch.io ou domaine).

Ne pas écrire la salle 2 avant que la salle 1 soit jouable de bout en bout
par deux personnes qui ne sont pas toi.
