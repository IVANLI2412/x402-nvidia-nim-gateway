"""Minimal x402 client for the NVIDIA NIM Gateway.

Runs one cheap call (0.01 USDC) and one expensive call (0.15 USDC, NVIDIA NIM
defensive code review). Reads the manifest first so you can see what you are
about to pay for.

    pip install x402 eth-account httpx
    export EVM_PRIVATE_KEY=0x...

Never commit the key. Use a throwaway wallet holding a few cents of USDC on Base.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

import httpx
from eth_account import Account
from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

BASE = "https://alcohol-congratulations-filters-acres.trycloudflare.com"
USDC_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

SOLIDITY_SAMPLE = """// SPDX-License-Identifier: MIT
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
"""


def show_manifest() -> dict:
    """Free call: what does the gateway sell, and at what price."""
    with httpx.Client(timeout=25) as http:
        data = http.get(f"{BASE}/.well-known/x402.json").json()
    print(f"mode={data.get('mode')}  services={len(data.get('services', []))}")
    for svc in data.get("services", []):
        print(f"  {svc['method']:5} {svc['path']:34} {svc['priceUsdc']:>7} USDC")
    return data


async def paid_calls() -> None:
    account = Account.from_key(os.environ["EVM_PRIVATE_KEY"])

    client = x402Client()
    register_exact_evm_client(client, EthAccountSigner(account))
    http_client = x402HTTPClient(client)

    async with x402HttpxClient(client) as http:
        # --- 0.01 USDC: Solana token risk -------------------------------
        resp = await http.get(f"{BASE}/v1/solana/token-risk", params={"mint": USDC_SOLANA})
        await resp.aread()
        print(f"\n[token-risk] HTTP {resp.status_code}")
        print(resp.text[:500])
        if resp.is_success:
            print("settled:", http_client.get_payment_settle_response(
                lambda name: resp.headers.get(name)))

        # --- 0.15 USDC: NVIDIA NIM defensive code review ----------------
        resp = await http.post(
            f"{BASE}/v1/security/defensive-code-review",
            json={"code": SOLIDITY_SAMPLE, "language": "solidity"},
        )
        await resp.aread()
        print(f"\n[defensive-review] HTTP {resp.status_code}")
        print(resp.text[:1200])
        if resp.is_success:
            print("settled:", http_client.get_payment_settle_response(
                lambda name: resp.headers.get(name)))


def main() -> int:
    show_manifest()
    if not os.environ.get("EVM_PRIVATE_KEY"):
        print("\nSet EVM_PRIVATE_KEY to run the paid calls.", file=sys.stderr)
        return 1
    asyncio.run(paid_calls())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
