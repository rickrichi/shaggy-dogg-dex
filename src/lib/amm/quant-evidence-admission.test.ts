import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  BASE_CHAIN_ID,
  computeCanonicalDigest,
  DexQuantEvidenceAdmissionGate,
  DurableDexReplayLedger,
  LUMIORO_EIP712_DOMAIN_NAME,
  LUMIORO_EIP712_DOMAIN_VERSION,
  QUANT_EVIDENCE_ADMISSION_TYPES,
  type QuantEvidenceAdmissionMessage,
  QuantEvidenceRejectedError,
  QuantEvidenceVerifier,
} from "./quant-evidence-admission";

const TEST_PRIVATE_KEY = "***REMOVED***" as Hex;
const TEST_ANCHOR = "0x1111111111111111111111111111111111111111" as const;
const NOW = 1_800_000_000;

function sampleEvidence() {
  const document: Record<string, unknown> = {
    quant_evidence_version: "1.0.0",
    generated_at_utc: "2026-09-28T12:00:00Z",
    suite: {
      id: "defi-flash-liquidity",
      module: "DeFiFlashLiquidityEngine",
      directive_range: "Directives 336-355",
      maturity: "RESEARCH_ONLY",
      app_targets: ["shaggy-dogg-dex", "lumioro-desk"],
    },
    execution: {
      mode: "READ_ONLY_LIVE",
      orders_submitted: false,
      orders_cancelled: false,
      declared_capabilities: ["read_base_reserves", "observe_pool_ticks"],
    },
    market: {
      pair: "WETH/USDC",
      chain: "Base",
      chainId: 8453,
    },
    result: {
      reference_price: 3450.0,
      base_dex_price: 3465.0,
      spread: 15.0,
      optimal_route: "BUY_POOL_A_SELL_POOL_B",
    },
  };
  const digest = computeCanonicalDigest(document);
  return { ...document, integrity: { sha256: digest } };
}

describe("DexQuantEvidenceAdmissionGate & Verifier", () => {
  it("computes deterministic canonical digest and rejects tampered evidence", () => {
    const evidence = sampleEvidence();
    const verified = QuantEvidenceVerifier.verify(evidence);

    expect(verified.suiteId).toBe("defi-flash-liquidity");
    expect(verified.module).toBe("DeFiFlashLiquidityEngine");
    expect(verified.digest).toMatch(/^0x[0-9a-f]{64}$/);

    // Tamper with order execution state
    const tampered = JSON.parse(JSON.stringify(evidence));
    tampered.execution.orders_submitted = true;
    expect(() => QuantEvidenceVerifier.verify(tampered)).toThrow(QuantEvidenceRejectedError);

    // Tamper with integrity digest
    const wrongDigest = JSON.parse(JSON.stringify(evidence));
    wrongDigest.integrity.sha256 = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    expect(() => QuantEvidenceVerifier.verify(wrongDigest)).toThrow(QuantEvidenceRejectedError);
  });

  it("DurableDexReplayLedger prevents nonce reuse and survives simulated restart", () => {
    const tempFile = path.join(os.tmpdir(), `dex-replay-${Date.now()}-${Math.random().toString(36).substring(7)}.jsonl`);
    try {
      const ledger1 = new DurableDexReplayLedger(tempFile, () => NOW);
      expect(ledger1.hasNonce("lumioro-desk", 101n)).toBe(false);

      ledger1.registerNonce("lumioro-desk", 101n, BigInt(NOW + 300));
      expect(ledger1.hasNonce("lumioro-desk", 101n)).toBe(true);
      expect(() => ledger1.registerNonce("lumioro-desk", 101n, BigInt(NOW + 300))).toThrow(QuantEvidenceRejectedError);

      // Simulate process restart: read from disk
      const ledger2 = new DurableDexReplayLedger(tempFile, () => NOW);
      expect(ledger2.hasNonce("lumioro-desk", 101n)).toBe(true);
      expect(() => ledger2.registerNonce("lumioro-desk", 101n, BigInt(NOW + 300))).toThrow(QuantEvidenceRejectedError);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it("admits verified evidence to armed paper plan and executes single-use simulation", async () => {
    const signerAccount = privateKeyToAccount(TEST_PRIVATE_KEY);
    const replayLedger = new DurableDexReplayLedger(undefined, () => NOW);

    const gate = new DexQuantEvidenceAdmissionGate({
      chainId: BASE_CHAIN_ID,
      verifyingContract: TEST_ANCHOR,
      expectedSigner: signerAccount.address,
      replayLedger,
      clock: () => NOW,
    });

    const evidence = sampleEvidence();
    const verified = QuantEvidenceVerifier.verify(evidence);

    const authorization: QuantEvidenceAdmissionMessage = {
      providerId: "lumioro-desk",
      evidenceDigest: verified.digest,
      armedPlanId: "dex-plan-001",
      accountMode: "paper",
      nonce: 555n,
      expiresAt: BigInt(NOW + 300),
    };

    const signature = await signerAccount.signTypedData({
      domain: {
        name: LUMIORO_EIP712_DOMAIN_NAME,
        version: LUMIORO_EIP712_DOMAIN_VERSION,
        chainId: BigInt(BASE_CHAIN_ID),
        verifyingContract: TEST_ANCHOR,
      },
      types: QUANT_EVIDENCE_ADMISSION_TYPES,
      primaryType: "QuantEvidenceAdmission",
      message: authorization,
    });

    // Refuse without exact phrase
    await expect(
      gate.admitSwapPlan(
        "dex-plan-001",
        "WETH/USDC",
        1_000_000_000_000_000_000n,
        3400_000_000n,
        evidence,
        authorization,
        signature,
        "PLEASE ADMIT"
      )
    ).rejects.toThrow("Admission requires exact confirmation phrase");

    // Admit with exact phrase
    const admitted = await gate.admitSwapPlan(
      "dex-plan-001",
      "WETH/USDC",
      1_000_000_000_000_000_000n,
      3400_000_000n,
      evidence,
      authorization,
      signature,
      "ADMIT PAPER"
    );

    expect(admitted.status).toBe("ARMED_PAPER");
    expect(admitted.planId).toBe("dex-plan-001");
    expect(admitted.evidenceDigest).toBe(verified.digest);

    // Refuse submit without exact phrase
    expect(() => gate.submitAdmittedSwap(admitted.admissionId, "CONFIRM")).toThrow(
      "Submission requires exact confirmation phrase"
    );

    // Submit with exact phrase
    const receipt = gate.submitAdmittedSwap(admitted.admissionId, "SUBMIT PAPER SWAP");
    expect(receipt.executed).toBe(true);
    expect(receipt.mode).toBe("PAPER_SIMULATION");
    expect(receipt.planId).toBe("dex-plan-001");
    expect(receipt.evidenceDigest).toBe(verified.digest);

    // Single use: cannot submit again
    expect(() => gate.submitAdmittedSwap(admitted.admissionId, "SUBMIT PAPER SWAP")).toThrow(
      "Admitted plan not found or already executed"
    );
  });

  it("structurally blocks any attempt at live mainnet execution", async () => {
    const signerAccount = privateKeyToAccount(TEST_PRIVATE_KEY);
    const gate = new DexQuantEvidenceAdmissionGate({
      chainId: BASE_CHAIN_ID,
      verifyingContract: TEST_ANCHOR,
      expectedSigner: signerAccount.address,
      clock: () => NOW,
    });

    const evidence = sampleEvidence();
    const verified = QuantEvidenceVerifier.verify(evidence);

    const liveAuth: QuantEvidenceAdmissionMessage = {
      providerId: "lumioro-desk",
      evidenceDigest: verified.digest,
      armedPlanId: "dex-plan-002",
      accountMode: "live",
      nonce: 777n,
      expiresAt: BigInt(NOW + 300),
    };

    const signature = await signerAccount.signTypedData({
      domain: {
        name: LUMIORO_EIP712_DOMAIN_NAME,
        version: LUMIORO_EIP712_DOMAIN_VERSION,
        chainId: BigInt(BASE_CHAIN_ID),
        verifyingContract: TEST_ANCHOR,
      },
      types: QUANT_EVIDENCE_ADMISSION_TYPES,
      primaryType: "QuantEvidenceAdmission",
      message: liveAuth,
    });

    await expect(
      gate.admitSwapPlan(
        "dex-plan-002",
        "WETH/USDC",
        1_000_000_000_000_000_000n,
        3400_000_000n,
        evidence,
        liveAuth,
        signature,
        "ADMIT PAPER"
      )
    ).rejects.toThrow("Live DEX mutation is structurally blocked: mainnet execution is disabled.");
  });
});
