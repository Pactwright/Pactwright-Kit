/**
 * Envelope store. Unique (pactId, milestone): one delivery verdict per pact (B3, ADR-003).
 * `MemoryVerdictStore` serves tests and local runs; `PostgresVerdictStore` keeps envelopes
 * across restarts for deployment (V-10).
 */
import pg from "pg";
import type { VerdictEnvelope } from "./types.ts";

export class DuplicateVerdictError extends Error {
  readonly pactId: string;
  readonly milestone: string;
  readonly existing: string;
  constructor(pactId: string, milestone: string, existing: string) {
    super(`a verdict for pact ${pactId} milestone ${milestone} already exists (${existing})`);
    this.pactId = pactId;
    this.milestone = milestone;
    this.existing = existing;
    this.name = "DuplicateVerdictError";
  }
}

export interface VerdictStore {
  /** Throws `DuplicateVerdictError` if (agreementId, milestoneId) already has an envelope. */
  put(envelope: VerdictEnvelope, sha256: string): Promise<void>;
  get(sha256: string): Promise<VerdictEnvelope | undefined>;
  /** Returns the existing envelope hash for (pactId, milestone), if any. */
  find(pactId: string, milestone: string): Promise<string | undefined>;
}

export class MemoryVerdictStore implements VerdictStore {
  private readonly bySha = new Map<string, VerdictEnvelope>();
  private readonly byMilestone = new Map<string, string>();

  private static key(pactId: string, milestone: string): string {
    return `${pactId}/${milestone}`;
  }

  async put(envelope: VerdictEnvelope, sha256: string): Promise<void> {
    const key = MemoryVerdictStore.key(envelope.agreementId, envelope.milestoneId);
    const existing = this.byMilestone.get(key);
    if (existing) throw new DuplicateVerdictError(envelope.agreementId, envelope.milestoneId, existing);
    this.bySha.set(sha256, envelope);
    this.byMilestone.set(key, sha256);
  }

  async get(sha256: string): Promise<VerdictEnvelope | undefined> {
    return this.bySha.get(sha256);
  }

  async find(pactId: string, milestone: string): Promise<string | undefined> {
    return this.byMilestone.get(MemoryVerdictStore.key(pactId, milestone));
  }
}

/**
 * Envelopes in Postgres. The primary key on (pact_id, milestone) keeps one verdict per pact
 * even across restarts and concurrent requests, so only one attestation is ever released.
 * The envelope is kept as the exact JSON text it was signed and served as.
 */
export class PostgresVerdictStore implements VerdictStore {
  private readonly pool: pg.Pool;

  private constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /** Connects and creates the table if it does not exist yet. */
  static async connect(connectionString: string): Promise<PostgresVerdictStore> {
    const pool = new pg.Pool({ connectionString, max: 5 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verifier_envelopes (
        pact_id    text NOT NULL,
        milestone  text NOT NULL,
        sha256     text NOT NULL,
        envelope   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (pact_id, milestone)
      );
      CREATE INDEX IF NOT EXISTS verifier_envelopes_sha256 ON verifier_envelopes (sha256);
    `);
    return new PostgresVerdictStore(pool);
  }

  async put(envelope: VerdictEnvelope, sha256: string): Promise<void> {
    const inserted = await this.pool.query(
      `INSERT INTO verifier_envelopes (pact_id, milestone, sha256, envelope) VALUES ($1, $2, $3, $4)
       ON CONFLICT (pact_id, milestone) DO NOTHING`,
      [envelope.agreementId, envelope.milestoneId, sha256, JSON.stringify(envelope)],
    );
    if (inserted.rowCount === 1) return;
    const existing = (await this.find(envelope.agreementId, envelope.milestoneId)) ?? sha256;
    throw new DuplicateVerdictError(envelope.agreementId, envelope.milestoneId, existing);
  }

  async get(sha256: string): Promise<VerdictEnvelope | undefined> {
    const res = await this.pool.query<{ envelope: string }>(
      "SELECT envelope FROM verifier_envelopes WHERE sha256 = $1 ORDER BY created_at LIMIT 1",
      [sha256],
    );
    return res.rows[0] ? (JSON.parse(res.rows[0].envelope) as VerdictEnvelope) : undefined;
  }

  async find(pactId: string, milestone: string): Promise<string | undefined> {
    const res = await this.pool.query<{ sha256: string }>(
      "SELECT sha256 FROM verifier_envelopes WHERE pact_id = $1 AND milestone = $2",
      [pactId, milestone],
    );
    return res.rows[0]?.sha256;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
