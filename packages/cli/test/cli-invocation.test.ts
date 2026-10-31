import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "pactwright-cli-"));
const binPath = join(tempDir, "pactwright");
const binEntry = new URL("../dist/index.js", import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as { version: string };

beforeAll(() => {
  symlinkSync(fileURLToPath(binEntry), binPath);
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8" });
}

describe("CLI executable invocation", () => {
  it("shows command help when invoked through a bin symlink", () => {
    const result = runCli("--help");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: pactwright <command> [args]");
    expect(result.stdout).toContain("agent-create");
    expect(result.stderr).toBe("");
  });

  it("prints the package version through the bin symlink", () => {
    const result = runCli("--version");

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("reports unknown commands with help and a failure status", () => {
    const result = runCli("not-a-command");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown command: not-a-command");
    expect(result.stderr).toContain("Usage: pactwright");
  });
});
