// src/lib/deployments.ts
// Lightweight helper to read deployment artifacts bundled with the app.
// JSON files in /deployments are eagerly imported at build time.

interface DeploymentJson {
  chainId: number;
  timestamp?: number;
  blockNumber?: number;
  deployer?: string;
  contracts: Record<string, string>;
}

export interface DeploymentSummary {
  chainId: number;
  chainName: string;
  deployer?: string;
  deployedAt?: number;
  contracts: Record<string, string>;
}

const chainNames: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  8453: "Base",
  84532: "Base Sepolia",
  42161: "Arbitrum One",
  421614: "Arbitrum Sepolia",
  31337: "Localhost",
};

function loadDeployments(): DeploymentSummary[] {
  const modules = import.meta.glob("../deployments/*.json", { eager: true });
  const entries: DeploymentSummary[] = [];

  for (const [path, mod] of Object.entries(modules)) {
    const data: DeploymentJson | undefined =
      typeof mod === "object" && mod !== null && "default" in (mod as any)
        ? ((mod as any).default as DeploymentJson)
        : (mod as DeploymentJson);

    if (!data || typeof data.chainId !== "number" || !data.contracts) continue;

    const entry: DeploymentSummary = {
      chainId: data.chainId,
      chainName:
        chainNames[data.chainId] ??
        path.split("/").pop()?.replace(".json", "") ??
        `Chain ${data.chainId}`,
      contracts: data.contracts,
    };

    if (data.deployer) entry.deployer = data.deployer;
    if (data.timestamp) entry.deployedAt = data.timestamp;

    entries.push(entry);
  }

  return entries.sort((a, b) => a.chainId - b.chainId);
}

export const DEPLOYMENTS: DeploymentSummary[] = loadDeployments();
export const deploymentsLastUpdated = DEPLOYMENTS.reduce<number | undefined>(
  (max, d) => (d.deployedAt ? Math.max(max ?? d.deployedAt, d.deployedAt) : max),
  undefined
);
