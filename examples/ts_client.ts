/**
 * Minimal x402 client for the NVIDIA NIM Gateway.
 *
 *   npm i @x402/fetch @x402/core @x402/evm viem
 *   npx tsx examples/ts_client.ts
 *
 * Reads the free manifest, then makes two paid calls.
 * Use a throwaway wallet with a few cents of USDC on Base.
 */

import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const BASE = "https://alcohol-congratulations-filters-acres.trycloudflare.com";
const USDC_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOLIDITY_SAMPLE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault {
    mapping(address => uint256) public balance;

    function withdraw(uint256 amount) external {
        require(balance[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balance[msg.sender] -= amount;   // state change after the external call
    }
}
`;

async function showManifest() {
  const data = await (await fetch(`${BASE}/.well-known/x402.json`)).json();
  console.log(`mode=${data.mode}  services=${data.services.length}`);
  for (const s of data.services) {
    console.log(`  ${s.method.padEnd(5)} ${s.path.padEnd(34)} ${s.priceUsdc.padStart(7)} USDC`);
  }
}

async function main() {
  await showManifest();

  const pk = process.env.EVM_PRIVATE_KEY;
  if (!pk) {
    console.error("\nSet EVM_PRIVATE_KEY to run the paid calls.");
    process.exit(1);
  }

  const signer = privateKeyToAccount(pk as `0x${string}`);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  // --- 0.03 USDC: sandbox generated code before you ship it -------------
  let res = await fetchWithPayment(`${BASE}/v1/compute/code-sandbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language: "python", code: "print(2 ** 10)" }),
  });
  console.log(`\n[sandbox] HTTP ${res.status}`);
  console.log(JSON.stringify(await res.json()).slice(0, 600));
  if (res.ok) {
    console.log("settled:", httpClient.getPaymentSettleResponse((n) => res.headers.get(n)));
  }

  // --- 0.15 USDC: NVIDIA NIM defensive code review ----------------------
  res = await fetchWithPayment(`${BASE}/v1/security/defensive-code-review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: SOLIDITY_SAMPLE, language: "solidity" }),
  });
  console.log(`\n[defensive-review] HTTP ${res.status}`);
  console.log(JSON.stringify(await res.json()).slice(0, 1200));
  if (res.ok) {
    console.log("settled:", httpClient.getPaymentSettleResponse((n) => res.headers.get(n)));
  }

  // --- 0.01 USDC: Solana token risk ------------------------------------
  res = await fetchWithPayment(
    `${BASE}/v1/solana/token-risk?mint=${USDC_SOLANA}`,
    { method: "GET" },
  );
  console.log(`\n[token-risk] HTTP ${res.status}`);
  console.log(JSON.stringify(await res.json()).slice(0, 600));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
