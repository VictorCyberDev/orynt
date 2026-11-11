import { loadConfig } from "./config";
import { buildApp } from "./http/app";
import { recoverOnStartup, startWorker } from "./worker";

const config = loadConfig();
const { app, deps, pool } = await buildApp(config);
await recoverOnStartup(deps);
if (process.env["ORYNT_SEED_DEMO"] === "1") {
  if (config.env === "production") throw new Error("refusing to seed demo data in production");
  const { seedDemo } = await import("./seed");
  await seedDemo({ app, deps, pool }, (m) => app.log.info(m));
}
const worker = config.workerEnabled ? startWorker(deps) : null;
await app.listen({ port: config.port, host: config.host });
app.log.info(
  `Orynt API listening on http://${config.host}:${config.port} (env=${config.env}, worker=${!!worker}, failpoints=${config.failpoints}, mainnet=${config.allowMainnet})`,
);
const shutdown = async (sig: string) => {
  app.log.info({ sig }, "shutting down");
  worker?.stop();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
