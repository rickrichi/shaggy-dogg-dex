import { METAMASK_7702_DELEGATOR_ON_BASE, SIMPLE_7702_ACCOUNT_ON_BASE } from "./client";

/** The code an EIP-7702 delegation leaves on a wallet: 0xef0100 followed by the implementation. */
const designator = (implementation: string) => `0xef0100${implementation.slice(2).toLowerCase()}`;

export const METAMASK_DESIGNATOR = designator(METAMASK_7702_DELEGATOR_ON_BASE);
const SIMPLE_7702_DESIGNATOR = designator(SIMPLE_7702_ACCOUNT_ON_BASE);

export const SPONSORSHIP_UNAVAILABLE =
  "Gas-free operations are unavailable from browser wallets for now.";

/** Shown before a wallet is connected: the reasons that apply to each kind of browser wallet. */
export const SPONSORSHIP_UNAVAILABLE_REASONS = `${SPONSORSHIP_UNAVAILABLE} MetaMask refuses to sign the operation its Smart Account needs when a website asks, the site cannot turn other browser wallets into a smart account, and Simple 7702 accounts use an EntryPoint the MRWD reward paymaster does not support.`;

/**
 * Why a wallet cannot complete a sponsored operation through the site, or null when it can.
 *
 * As of 2026-11-02 no browser wallet can: MetaMask refuses to sign the user operation its 7702
 * Smart Account needs when a website asks (docs/SWAP_ROUTING_SESSION_RECORD_2026-10-30.md), a
 * plain browser wallet cannot be delegated by the site, and Simple 7702 accounts use EntryPoint
 * v0.8 while the reward paymaster runs on v0.7. The MetaMask branch of the transfer flow is kept
 * for when MetaMask allows that signature; update this function then.
 */
export function sponsoredAccountProblem(code: string | null | undefined): string | null {
  const walletCode = code?.toLowerCase();
  if (!walletCode || walletCode === "0x") {
    return `${SPONSORSHIP_UNAVAILABLE} Sponsorship needs a smart account, and the site cannot turn a browser wallet into one.`;
  }
  if (walletCode === METAMASK_DESIGNATOR) {
    return `${SPONSORSHIP_UNAVAILABLE} MetaMask refuses to sign the operation its Smart Account needs when a website asks, so a sponsored operation cannot complete.`;
  }
  if (walletCode === SIMPLE_7702_DESIGNATOR) {
    return `${SPONSORSHIP_UNAVAILABLE} This wallet is a Simple 7702 smart account, which uses ERC-4337 EntryPoint v0.8, and the MRWD reward paymaster runs on v0.7.`;
  }
  return `${SPONSORSHIP_UNAVAILABLE} This wallet is delegated to a smart account implementation the reward paymaster does not support.`;
}
