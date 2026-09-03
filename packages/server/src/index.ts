import { logger } from "@colyseus/core";
import { createGameServer } from "./server";

const port = Number(process.env["PORT"] ?? 2567);

await createGameServer().listen(port);
logger.info(`Serveur de jeu a l'ecoute sur le port ${port}`);
