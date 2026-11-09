import type { Role } from "@orynt/core";
import type { Config } from "../config";
import type { Db } from "../db/pool";

export interface Actor {
  kind: "user" | "apikey" | "system";
  id: string; // user id, api key id or component name
  userId?: string;
  name: string;
  role: Role | "system";
}
export interface Ctx {
  orgId: string;
  actor: Actor;
  reqId: string;
}
export interface Deps {
  pool: Db;
  config: Config;
  issuerPublicKey: string;
  issuerKeyId: string;
  log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void };
}
export const actorTag = (a: Actor) => `${a.kind}:${a.id}`;
export const iso = (d: Date | string) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
export const isoMs = (d: Date | string) => new Date(d).toISOString();
