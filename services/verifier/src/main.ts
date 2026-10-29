/** Verifier process entrypoint. Refuses to start, listing every problem, on incomplete configuration. ROADMAP V-10. */
import { loadVerifierConfig, VerifierConfigError } from "./config.ts";
import { startServer } from "./server.ts";

try {
  const config = loadVerifierConfig(process.env);
  await startServer(config);
  console.log(
    JSON.stringify({
      level: "info",
      msg: "verifier listening",
      port: config.port,
      verifier: config.verifierKey.publicKey(),
      provider: config.provider,
      model: config.model,
      publicUrl: config.publicUrl,
      store: config.databaseUrl ? "postgres" : "memory",
    }),
  );
} catch (e) {
  if (!(e instanceof VerifierConfigError)) throw e;
  console.error(e.message);
  process.exit(1);
}
