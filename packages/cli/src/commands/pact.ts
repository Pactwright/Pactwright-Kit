/** Show a pact's state and timeline. ROADMAP K-12. */

export interface PactCommandOptions {
  fetchImpl?: typeof fetch;
  facilitatorUrl?: string;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export async function pact(args: string[], options?: PactCommandOptions): Promise<void> {
  const log = options?.log ?? console.log;
  const errorLog = options?.error ?? console.error;

  const pactId = args[0];
  if (!pactId) {
    errorLog("usage: pactwright pact <pact-id>");
    process.exitCode = 2;
    return;
  }

  const base = (options?.facilitatorUrl ?? process.env.STUDIO_URL ?? "https://studio.pactwright.dev").replace(/\/$/, "");
  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  const url = `${base}/api/pacts/${pactId}`;

  interface PactDetails {
    pactId: string;
    state?: string;
    mode?: string;
    buyer?: string;
    seller?: string;
    timeline?: { stage: string; timestamp?: string }[];
  }

  let data: PactDetails;

  try {
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data = (await res.json()) as PactDetails;
  } catch (err) {
    // Inventing a settled timeline here reported today's clock as the pact's history and told the
    // caller the money had moved. A failed read is reported as a failed read.
    errorLog(`Could not read pact ${pactId} from ${url}: ${err instanceof Error ? err.message : String(err)}`);
    log(`Pact:     ${pactId}`);
    log("State:    unknown");
    process.exitCode = 1;
    return;
  }

  log(`Pact:     ${data.pactId}`);
  log(`State:    ${data.state ?? "unknown"}`);
  if (data.mode) log(`Mode:     ${data.mode}`);
  if (data.buyer) log(`Buyer:    ${data.buyer}`);
  if (data.seller) log(`Seller:   ${data.seller}`);
  if (data.timeline && data.timeline.length > 0) {
    log(`Timeline:`);
    for (const entry of data.timeline) {
      log(`  - ${entry.stage}${entry.timestamp ? ` (${entry.timestamp})` : ""}`);
    }
  }
}
