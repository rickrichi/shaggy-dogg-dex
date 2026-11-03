import { type Address, erc20Abi, type PublicClient } from "viem";

interface AllowanceTarget {
  token: Address;
  owner: Address;
  spender: Address;
  /** The allowance the next transaction needs. */
  amount: bigint;
}

/**
 * The approve() values to send, in order, so `spender` can pull `amount` of `token`.
 *
 * Some tokens (Ethereum's USDT is the common one) revert when an allowance is changed from one
 * non-zero value to another. Routers often leave part of an earlier approval unused, so a second
 * deposit or a larger trade would fail. When the current allowance is non-zero but too small, the
 * direct approval is simulated first, and only a token that refuses it gets a reset to 0 before
 * the new amount. Ordinary tokens never pay for the extra transaction.
 */
export async function approvalSequence(
  client: Pick<PublicClient, "readContract" | "simulateContract">,
  { token, owner, spender, amount }: AllowanceTarget
): Promise<bigint[]> {
  const current = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (current >= amount) return [];
  if (current === 0n) return [amount];
  try {
    await client.simulateContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
      account: owner,
    });
    return [amount];
  } catch {
    return [0n, amount];
  }
}
