/** Route attribution via @accensa/sdk createSettleHook(); M2 auto-settle on ALLOW. ROADMAP K-07. */
import { createSettleHook } from "@accensa/sdk";
import { notImplemented } from "@pactwright/core";

export { createSettleHook };

export async function onSettled(_event: unknown): Promise<void> {
  return notImplemented("K-07");
}
