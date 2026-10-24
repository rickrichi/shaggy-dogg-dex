// src/lib/launchpad/reportLaunch.ts
import type { Hash } from "viem";

export type LaunchReport = { recorded: true } | { recorded: false; reason: string };

/**
 * Reports a launch's deployment transaction for the launchpad demand count. The server verifies it
 * on Base before recording, so this never blocks or fails a launch; it only says whether it counted.
 */
export async function reportLaunch(
  txHash: Hash,
  fetchImpl: typeof fetch = fetch
): Promise<LaunchReport> {
  try {
    const response = await fetchImpl("/api/launches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
    if (response.ok) return { recorded: true };
    const body = (await response.json().catch(() => null)) as { reason?: string } | null;
    return { recorded: false, reason: body?.reason ?? `HTTP ${response.status}` };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : "network error" };
  }
}
