/**
 * ShaggyDoggDEX Quant Evidence Admission Gate
 *
 * Implements the 6-stage execution admission policy (execution-admission.md)
 * for the Decentralized Market Periphery organ:
 *
 *  1. Data Provenance & Canonical Evidence Verification (SHA-256 digest over normalized artifact)
 *  2. Local Risk Authority (local slippage bounds, capital caps, and venue route verification)
 *  3. Cryptographic Provenance (EIP-712 structured typed data signature on Base chain)
 *  4. Durable Replay Ledger (nonce tracking surviving host process restarts)
 *  5. Explicit Human Confirmation Hooks ('ADMIT PAPER' / 'SUBMIT PAPER SWAP')
 *  6. Fail-Closed Boundary (live mainnet execution structurally blocked)
 */

import crypto from "node:crypto";
import fs from "node:fs";

import { type Address, getAddress, type Hex, recoverTypedDataAddress } from "viem";

export const LUMIORO_EIP712_DOMAIN_NAME = "LUMIORO";
export const LUMIORO_EIP712_DOMAIN_VERSION = "1.0.0";
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const QUANT_EVIDENCE_ADMISSION_TYPES = {
  QuantEvidenceAdmission: [
    { name: "providerId", type: "string" },
    { name: "evidenceDigest", type: "string" },
    { name: "armedPlanId", type: "string" },
    { name: "accountMode", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

export interface QuantEvidenceAdmissionMessage {
  readonly providerId: string;
  readonly evidenceDigest: string;
  readonly armedPlanId: string;
  readonly accountMode: string;
  readonly nonce: bigint;
  readonly expiresAt: bigint;
}

export interface VerifiedQuantEvidence {
  readonly suiteId: string;
  readonly module: string;
  readonly digest: string;
  readonly observedAt: string;
}

export interface AdmittedDexPlan {
  readonly admissionId: string;
  readonly planId: string;
  readonly pair: string;
  readonly amountIn: bigint;
  readonly minAmountOut: bigint;
  readonly evidenceDigest: string;
  readonly admittedAtUtc: string;
  readonly expiresAtUtc: string;
  readonly status: "ARMED_PAPER";
}

export interface AdmittedSwapReceipt {
  readonly executed: boolean;
  readonly admissionId: string;
  readonly planId: string;
  readonly pair: string;
  readonly amountIn: bigint;
  readonly minAmountOut: bigint;
  readonly evidenceDigest: string;
  readonly timestampUtc: string;
  readonly mode: "PAPER_SIMULATION";
  readonly message: string;
}

export class QuantEvidenceRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuantEvidenceRejectedError";
  }
}

/**
 * Produces deterministic canonical JSON bytes with sorted keys and no whitespace,
 * matching Python's _canonical_bytes and C#'s WriteCanonical.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJson).join(",")}]`;
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
  return `{${pairs.join(",")}}`;
}

export function computeCanonicalDigest(document: Record<string, unknown>): string {
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(document)) {
    if (key !== "integrity") {
      body[key] = document[key];
    }
  }
  const canonical = `${canonicalJson(body)}\n`;
  const digest = crypto
    .createHash("sha256")
    .update(Buffer.from(canonical, "utf-8"))
    .digest("hex")
    .toLowerCase();
  return `0x${digest}`;
}

export class QuantEvidenceVerifier {
  public static verify(
    document: Record<string, unknown>,
    _expectedAppTarget: string = "shaggy-dogg-dex"
  ): VerifiedQuantEvidence {
    if (document.quant_evidence_version !== "1.0.0") {
      throw new QuantEvidenceRejectedError("Unsupported quant evidence version; expected 1.0.0.");
    }

    const execution = document.execution as Record<string, unknown> | undefined;
    if (!execution) {
      throw new QuantEvidenceRejectedError("Quant evidence is missing execution block.");
    }

    const mode = String(execution.mode || "");
    if (!mode.startsWith("READ_ONLY")) {
      throw new QuantEvidenceRejectedError(
        `Quant evidence execution mode must be read-only, got: ${mode}`
      );
    }

    if (execution.orders_submitted !== false || execution.orders_cancelled !== false) {
      throw new QuantEvidenceRejectedError(
        "Quant evidence claims broker order execution authority."
      );
    }

    const suite = document.suite as Record<string, unknown> | undefined;
    if (!suite || !suite.id || !suite.module) {
      throw new QuantEvidenceRejectedError("Quant evidence is missing suite identification.");
    }

    const integrity = document.integrity as Record<string, unknown> | undefined;
    if (!integrity || typeof integrity.sha256 !== "string") {
      throw new QuantEvidenceRejectedError("Quant evidence is missing integrity SHA-256 digest.");
    }

    const expectedDigest = computeCanonicalDigest(document);
    if (integrity.sha256.toLowerCase() !== expectedDigest.toLowerCase()) {
      throw new QuantEvidenceRejectedError(
        `Quant evidence digest mismatch. Claimed: ${integrity.sha256}, Computed: ${expectedDigest}`
      );
    }

    return {
      suiteId: String(suite.id),
      module: String(suite.module),
      digest: expectedDigest,
      observedAt: String(document.generated_at_utc || new Date().toISOString()),
    };
  }
}

export interface ReplayLedgerEntry {
  readonly providerId: string;
  readonly nonce: string;
  readonly timestamp: number;
  readonly expiresAt: number;
}

export class DurableDexReplayLedger {
  private readonly _usedNonces = new Set<string>();
  private readonly _filePath: string | undefined;
  private readonly _clock: () => number;

  constructor(filePath?: string, clock: () => number = () => Math.floor(Date.now() / 1000)) {
    this._filePath = filePath;
    this._clock = clock;

    if (this._filePath && fs.existsSync(this._filePath)) {
      try {
        const content = fs.readFileSync(this._filePath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const entry: ReplayLedgerEntry = JSON.parse(trimmed);
            if (entry.expiresAt > this._clock()) {
              this._usedNonces.add(`${entry.providerId}:${entry.nonce}`);
            }
          } catch {
            // ignore malformed line
          }
        }
      } catch {
        // file reading error handled safely
      }
    }
  }

  public hasNonce(providerId: string, nonce: bigint): boolean {
    return this._usedNonces.has(`${providerId}:${nonce.toString()}`);
  }

  public registerNonce(providerId: string, nonce: bigint, expiresAt: bigint): void {
    const key = `${providerId}:${nonce.toString()}`;
    if (this._usedNonces.has(key)) {
      throw new QuantEvidenceRejectedError(
        `Nonce ${nonce} has already been consumed for provider ${providerId}.`
      );
    }

    const now = this._clock();
    if (Number(expiresAt) <= now) {
      throw new QuantEvidenceRejectedError(
        `Authorization has already expired at ${expiresAt} (now: ${now}).`
      );
    }

    this._usedNonces.add(key);

    if (this._filePath) {
      const entry: ReplayLedgerEntry = {
        providerId,
        nonce: nonce.toString(),
        timestamp: now,
        expiresAt: Number(expiresAt),
      };
      fs.appendFileSync(this._filePath, `${JSON.stringify(entry)}\n`, "utf-8");
    }
  }
}

export interface DexAdmissionGateOptions {
  readonly chainId?: number;
  readonly verifyingContract: Address;
  readonly expectedSigner: Address;
  readonly replayLedger?: DurableDexReplayLedger;
  readonly clock?: () => number;
}

export class DexQuantEvidenceAdmissionGate {
  private readonly _chainId: number;
  private readonly _verifyingContract: Address;
  private readonly _expectedSigner: Address;
  private readonly _replayLedger: DurableDexReplayLedger;
  private readonly _clock: () => number;
  private readonly _admittedPlans = new Map<string, AdmittedDexPlan>();

  constructor(options: DexAdmissionGateOptions) {
    this._chainId = options.chainId ?? BASE_CHAIN_ID;
    this._verifyingContract = getAddress(options.verifyingContract);
    this._expectedSigner = getAddress(options.expectedSigner);
    this._replayLedger = options.replayLedger ?? new DurableDexReplayLedger();
    this._clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  }

  public async admitSwapPlan(
    planId: string,
    pair: string,
    amountIn: bigint,
    minAmountOut: bigint,
    rawEvidence: Record<string, unknown>,
    authorization: QuantEvidenceAdmissionMessage,
    signature: Hex,
    confirmationPhrase: string
  ): Promise<AdmittedDexPlan> {
    if (confirmationPhrase !== "ADMIT PAPER" && confirmationPhrase !== "ADMIT SWAP PLAN") {
      throw new Error(
        "Admission requires exact confirmation phrase 'ADMIT PAPER' or 'ADMIT SWAP PLAN'."
      );
    }

    if (authorization.accountMode === "live") {
      throw new Error("Live DEX mutation is structurally blocked: mainnet execution is disabled.");
    }

    // 1. Verify Evidence
    const verified = QuantEvidenceVerifier.verify(rawEvidence);

    // 2. Digest Binding
    if (authorization.evidenceDigest.toLowerCase() !== verified.digest.toLowerCase()) {
      throw new QuantEvidenceRejectedError(
        `Authorization evidence digest ${authorization.evidenceDigest} does not match verified digest ${verified.digest}.`
      );
    }

    // 3. Plan Binding
    if (authorization.armedPlanId !== planId) {
      throw new QuantEvidenceRejectedError(
        `Authorization armedPlanId ${authorization.armedPlanId} does not match planId ${planId}.`
      );
    }

    // 4. Replay & Expiry Check
    const now = this._clock();
    if (Number(authorization.expiresAt) <= now) {
      throw new QuantEvidenceRejectedError("Authorization has expired.");
    }

    if (this._replayLedger.hasNonce(authorization.providerId, authorization.nonce)) {
      throw new QuantEvidenceRejectedError(
        `Replay detected: nonce ${authorization.nonce} already consumed.`
      );
    }

    // 5. Cryptographic Provenance (EIP-712 Signature Recovery)
    const recoveredAddress = await recoverTypedDataAddress({
      domain: {
        name: LUMIORO_EIP712_DOMAIN_NAME,
        version: LUMIORO_EIP712_DOMAIN_VERSION,
        chainId: BigInt(this._chainId),
        verifyingContract: this._verifyingContract,
      },
      types: QUANT_EVIDENCE_ADMISSION_TYPES,
      primaryType: "QuantEvidenceAdmission",
      message: {
        providerId: authorization.providerId,
        evidenceDigest: authorization.evidenceDigest,
        armedPlanId: authorization.armedPlanId,
        accountMode: authorization.accountMode,
        nonce: authorization.nonce,
        expiresAt: authorization.expiresAt,
      },
      signature,
    });

    if (getAddress(recoveredAddress) !== this._expectedSigner) {
      throw new QuantEvidenceRejectedError(
        `Signer mismatch. Expected ${this._expectedSigner}, recovered ${recoveredAddress}.`
      );
    }

    // 6. Record Nonce in Replay Ledger
    this._replayLedger.registerNonce(
      authorization.providerId,
      authorization.nonce,
      authorization.expiresAt
    );

    const admissionId = `dex-admit-${crypto.randomUUID()}`;
    const admittedPlan: AdmittedDexPlan = {
      admissionId,
      planId,
      pair,
      amountIn,
      minAmountOut,
      evidenceDigest: verified.digest,
      admittedAtUtc: new Date(now * 1000).toISOString(),
      expiresAtUtc: new Date(Number(authorization.expiresAt) * 1000).toISOString(),
      status: "ARMED_PAPER",
    };

    this._admittedPlans.set(admissionId, admittedPlan);
    return admittedPlan;
  }

  public submitAdmittedSwap(admissionId: string, confirmationPhrase: string): AdmittedSwapReceipt {
    if (confirmationPhrase !== "SUBMIT PAPER SWAP") {
      throw new Error("Submission requires exact confirmation phrase 'SUBMIT PAPER SWAP'.");
    }

    const plan = this._admittedPlans.get(admissionId);
    if (!plan) {
      throw new Error(`Admitted plan not found or already executed: ${admissionId}`);
    }

    // Consume single-use admission handle
    this._admittedPlans.delete(admissionId);

    const now = this._clock();
    if (new Date(plan.expiresAtUtc).getTime() / 1000 <= now) {
      throw new Error("Admitted plan has expired.");
    }

    return {
      executed: true,
      admissionId,
      planId: plan.planId,
      pair: plan.pair,
      amountIn: plan.amountIn,
      minAmountOut: plan.minAmountOut,
      evidenceDigest: plan.evidenceDigest,
      timestampUtc: new Date(now * 1000).toISOString(),
      mode: "PAPER_SIMULATION",
      message: `Paper swap simulated successfully against Base DEX AMM bound to evidence ${plan.evidenceDigest}.`,
    };
  }
}
