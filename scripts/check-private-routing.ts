import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { verifyPrivateSubmission } from "./lib/private-submission";
if (existsSync(".env.private-routing")) loadEnvFile(".env.private-routing");
try {
  const config = await verifyPrivateSubmission(process.env);
  console.log(JSON.stringify({ provider: config.provider, chainId: 8453, endpointReachable: true,
    publicFallback: false, privacy: "Provider policy; not independently measurable by eth_chainId" }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Private routing validation failed");
  process.exitCode = 1;
}
