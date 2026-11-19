# x402 NVIDIA NIM Gateway

Nine pay-per-call endpoints for AI agents, settled with [x402](https://x402.org) in **USDC on Base**. No API keys, no accounts, no signup: the agent gets an HTTP `402` with a price, pays, retries, gets the data.

Live base URL: **`https://alcohol-congratulations-filters-acres.trycloudflare.com`**
Discovery manifest: [`/.well-known/x402.json`](https://alcohol-congratulations-filters-acres.trycloudflare.com/.well-known/x402.json)

`x402` · `ai-agents` · `mcp` · `base` · `solana` · `stellar` · `smart-contract-audit` · `nvidia-nim` · `usdc`

---

## Endpoints

| Method | Path | Price (USDC) | What it returns |
|---|---|---|---|
| POST | `/v1/security/defensive-code-review` | **0.15** | NVIDIA NIM-backed defensive review of a contract or patch |
| POST | `/v1/ai/verified-code-fix` | **0.10** | NVIDIA NIM-backed fix proposal, verified before returning |
| POST | `/v1/quantum/qubo-solver` | **0.08** | QUBO/QAOA solver via simulated annealing on CPU |
| POST | `/v1/security/tx-simulate` | **0.03** | read-only anti-honeypot / anti-rug simulation (advisory) |
| POST | `/v1/compute/code-sandbox` | **0.03** | time-boxed Python / Solidity / Rust sandbox |
| GET | `/v1/solana/token-risk` | **0.01** | liquidity, top-holder concentration, mint/freeze authorities, risk score |
| GET | `/v1/evm/gas-and-rpc-pulse` | **0.01** | base/priority fee and latest block (Base / Arbitrum / Optimism) |
| GET | `/v1/stellar/account-health` | **0.01** | XLM balance, minimum reserve, trustlines |
| POST | `/v1/stream/quantum-session` | **0.0005 / s** | continuous solver rental (0.05 USDC minimum deposit) |

Free and unauthenticated: `GET /health` and `GET /.well-known/x402.json`.

---

## See it work in 10 seconds (no payment)

```bash
BASE=https://alcohol-congratulations-filters-acres.trycloudflare.com

curl -s $BASE/.well-known/x402.json | jq '.services[] | {path, priceUsdc}'
curl -s -i $BASE/v1/solana/token-risk?mint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

The second call returns `HTTP/1.1 402 Payment Required` with a body like:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required — pago USDC por llamada (0.01 USDC)",
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "10000",
    "resource": "/v1/solana/token-risk",
    "payTo": "0xC5dD2Ea54FF138bb3f71D3466092eA31eF115868"
  }]
}
```

`maxAmountRequired` is in USDC base units (6 decimals): `10000` = 0.01 USDC, `150000` = 0.15 USDC.

---

## Python client (`httpx` + `x402`)

```bash
pip install x402 eth-account
export EVM_PRIVATE_KEY=0x...   # a throwaway wallet with a few cents of USDC on Base
```

```python
import asyncio
import os

from eth_account import Account
from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

BASE = "https://alcohol-congratulations-filters-acres.trycloudflare.com"


async def main() -> None:
    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(Account.from_key(os.environ["EVM_PRIVATE_KEY"])))
    http_client = x402HTTPClient(client)

    async with x402HttpxClient(client) as http:
        # 0.01 USDC: Solana token risk
        r = await http.get(f"{BASE}/v1/solana/token-risk",
                           params={"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"})
        await r.aread()
        print(r.status_code, r.text[:400])

        if r.is_success:
            print("settled:", http_client.get_payment_settle_response(lambda n: r.headers.get(n)))


asyncio.run(main())
```

A fuller version, including the 0.15 USDC defensive review, is in [`examples/python_client.py`](examples/python_client.py).

---

## TypeScript / Node client (`fetch` + `@x402/fetch`)

```bash
npm i @x402/fetch @x402/core @x402/evm viem
export EVM_PRIVATE_KEY=0x...
```

```ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const BASE = "https://alcohol-congratulations-filters-acres.trycloudflare.com";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// 0.03 USDC: run generated code in an isolated sandbox before you ship it
const res = await fetchWithPayment(`${BASE}/v1/compute/code-sandbox`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ language: "python", code: "print(2 ** 10)" }),
});

console.log(res.status, await res.json());
```

Full version: [`examples/ts_client.ts`](examples/ts_client.ts).

---

## When you want to inspect the 402 by hand

Useful before wiring an SDK, and for debugging a client that refuses to pay:

```bash
curl -s -i -X POST $BASE/v1/security/defensive-code-review \
  -H 'content-type: application/json' \
  -d '{"code":"// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\ncontract A { function f() external { (bool ok,) = msg.sender.call{value: address(this).balance}(\"\"); require(ok); } }","language":"solidity"}'
```

You get the same `402` shape every time. Nothing is charged until a valid `X-PAYMENT` header arrives.

---

## Version note (read this before filing a bug)

This gateway advertises **`x402Version: 1`** with `scheme: exact` and the `X-PAYMENT` header. Current SDK releases default to v2 conventions; if your client refuses the challenge or sends `PAYMENT-SIGNATURE` instead of `X-PAYMENT`, that is the version mismatch, not a broken endpoint. Two options:

- pin a client version that negotiates v1, or
- check `x402Version` in the manifest first and branch on it.

If you need a v2-native endpoint, open an issue and say so — that is a better signal than guessing.

---

## Trust and safety

The service is deliberately narrow:

| Capability | Value |
|---|---|
| Signing | **false** |
| Withdrawals | **false** |
| On-chain writes | **false** |
| Owner approval required | **true** |

It verifies payments read-only and returns data. It never signs a transaction on your behalf, never moves funds, and never touches your wallet.

Pay-to addresses:

- Base / EVM: `0xC5dD2Ea54FF138bb3f71D3466092eA31eF115868`
- Solana: `DN3pfYEvdkoTBP4oaEVvemsr98fZPhDSAbfVfmewRGQ5`

---

## Verified, not claimed

On 2026-11-19 the manifest returned `mode: LIVE` with 9 services, and each route answered `402` with `maxAmountRequired` equal to its listed price (`150000`, `100000`, `80000`, `30000`, `30000`, `10000`). The manifest in this repository ([`x402.json`](x402.json), mirrored at [`.well-known/x402.json`](.well-known/x402.json)) is a byte-for-byte copy of the live one.

## License

MIT
