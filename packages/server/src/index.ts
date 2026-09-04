import { logger } from "@colyseus/core";
import { chargerEnv } from "./outils/env";
import { protegerLeProcessus } from "./outils/erreurs";
import { createGameServer } from "./server";

// CONTENT_KEY vient de l'environnement en production ; .env est le repli
// local, pour pouvoir lancer le vrai contenu sur sa machine.
chargerEnv();
protegerLeProcessus();

const port = Number(process.env["PORT"] ?? 2567);

await createGameServer().listen(port);
logger.info(`Serveur de jeu a l'ecoute sur le port ${port}`);
