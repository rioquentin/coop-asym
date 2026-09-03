/**
 * Types et constantes partages entre le serveur et le client.
 *
 * Ce paquet ne contient AUCUNE logique de resolution et ne doit jamais en
 * contenir : il est importe par le bundle client (CLAUDE.md section 3).
 */

export * from "./roomCode";
export * from "./protocol";
export * from "./puzzle";
export * from "./state";
