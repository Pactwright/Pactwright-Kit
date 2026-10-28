/** Thrown by every scaffold stub. The message names the ROADMAP task that implements it. */
export class NotImplementedError extends Error {
  constructor(public readonly task: string) {
    super(`Not implemented yet (ROADMAP ${task})`);
    this.name = "NotImplementedError";
  }
}

export function notImplemented(task: string): never {
  throw new NotImplementedError(task);
}
