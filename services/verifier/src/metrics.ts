/**
 * Verdict counters, reported on `GET /health` so ops monitoring can compute a verifier error
 * rate (ROADMAP XC-03). Counted since this process started; a restart resets them.
 */
export class VerdictMetrics {
  /** Verdicts the verifier was asked to decide. */
  verdictRequests = 0;
  /** Of those, the ones it could not decide because the server itself failed (5xx). */
  verdictFailures = 0;

  /**
   * Runs one verdict handler and records its outcome. A 400 is the caller's mistake and a 409
   * says "already decided", so neither asked the verifier for a verdict and neither counts;
   * counting them would let a flood of bad requests dilute a genuinely broken pipeline.
   */
  async track(handle: () => Promise<Response>): Promise<Response> {
    try {
      const res = await handle();
      if (res.status !== 400 && res.status !== 409) {
        this.verdictRequests += 1;
        // 501 is a condition kind this verifier cannot decide yet; for ops that is a failure
        // to serve, not a success.
        if (res.status >= 500) this.verdictFailures += 1;
      }
      return res;
    } catch (err) {
      // `app.onError` answers any other throw with 500: the verifier tried and broke.
      this.verdictRequests += 1;
      this.verdictFailures += 1;
      throw err;
    }
  }
}
