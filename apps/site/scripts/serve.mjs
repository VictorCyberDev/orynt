import { startServer } from "./server.mjs";
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
await startServer(port);
console.log(`serving dist/ at http://127.0.0.1:${port}/`);
