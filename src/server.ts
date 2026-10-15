import Fastify from "fastify";

import { config } from "./config";
import { closeDatabase } from "./db/client";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

async function start(): Promise<void> {
  await app.listen({ host: "0.0.0.0", port: config.port });
}

app.addHook("onClose", closeDatabase);

start().catch(async (error: unknown) => {
  app.log.error(error);
  await app.close();
  process.exit(1);
});
