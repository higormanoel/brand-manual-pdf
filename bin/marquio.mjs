#!/usr/bin/env node
import { runCli } from "../dist/node/cli.js";
try {
  const server = await runCli(process.argv.slice(2));
  if (server) {
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        void server.close().then(() => process.exit(0));
      });
  }
} catch (error) {
  console.error(
    `Marquio: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
