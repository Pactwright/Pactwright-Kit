# Security Policy

Pactwright handles payments. Please report vulnerabilities privately.

## Reporting

- **Do not** open a public issue for a vulnerability.
- Report it through GitHub's private security advisory form:
  <https://github.com/Pactwright/Pactwright-Kit/security/advisories/new>
  (see also the [repository security tab](https://github.com/Pactwright/Pactwright-Kit/security)).
- Include: affected component, steps to reproduce, impact, and a suggested fix if you have one.

We acknowledge reports within 72 hours. Status: pre-release, testnet only; no bounty yet.

## Audit Status Disclaimer

> **Pre-release / Testnet Only**: Pactwright Kit, SDK packages, and verifier service implementations have **not yet undergone an independent formal security audit**. They are deployed for testnet integration. Real mainnet funds should not be committed until formal audits (ROADMAP tasks P8-01 and P8-02) have concluded.

## PR Security Policy

All pull requests are automatically screened by `.github/workflows/pr-malware-guard.yml` against Trojan Source attacks (CVE-2021-42576), malicious shell scripts, raw socket connections, and unvetted binary executables. Lockfiles are strictly checked with frozen-lockfile validation.

## What we hold ourselves to

Reports that touch money movement — pact funds, refunds, the verifier's signed attestations — are
triaged first, because there is no admin path to a pact's funds and a forged verdict is the whole
trust model.

- [Verifier operations and key policy](docs/verifier-ops-and-keys.md): where the signing key lives
  and why it never leaves the host's secret store.
- [Facilitator hardening](docs/facilitator-hardening.md): the `pact` scheme validation rules a
  payment is checked against.
- [OpenSSF Scorecard results](https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-Kit):
  the supply-chain posture of this repository, measured continuously by CI
  ([`scorecard.yml`](.github/workflows/scorecard.yml)) and published as a badge in the README.
