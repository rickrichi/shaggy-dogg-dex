"""Hedge a specifically authorized, finalized Base USDC->WETH swap on Kraken.

Default is read-only. --execute additionally requires HEDGE_LIVE_ENABLED=true.
Uses prefunded Kraken ETH inventory, ETH/USDC settlement, and one IOC limit order.
Never resubmits an ambiguous order. SQLite journals survive process restarts.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
from decimal import Decimal
import urllib.request

USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
WETH = "0x4200000000000000000000000000000000000006"
ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
TERMINAL = {"completed", "no_fill", "partial_fill", "rejected"}


def rpc(method, params):
    endpoint = os.environ.get("BASE_READ_RPC_HTTP", "https://mainnet.base.org")
    request = urllib.request.Request(endpoint, data=json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
    }).encode(), headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
    except Exception:
        raise RuntimeError("Base read RPC unavailable") from None
    if data.get("error"):
        raise RuntimeError("Base read RPC rejected request")
    return data["result"]


def confirmed_swap(tx, receipt, wallet):
    """Restrict v1 to the canonical V2 exact-input USDC/WETH direct swap."""
    wallet = wallet.lower()
    if tx["from"].lower() != wallet or (tx.get("to") or "").lower() != ROUTER:
        raise ValueError("Transaction is not this wallet's Uniswap V2 swap")
    if receipt["status"] != "0x1" or tx["hash"].lower() != receipt["transactionHash"].lower():
        raise ValueError("Swap did not succeed")
    data = tx["input"].lower()
    if not data.startswith("0x38ed1739"):
        raise ValueError("Only swapExactTokensForTokens is supported")
    words = [data[i:i + 64] for i in range(10, len(data), 64)]
    if len(words) != 8 or int(words[2], 16) != 160 or int(words[5], 16) != 2:
        raise ValueError("Only direct USDC/WETH paths are supported")
    if "0x" + words[3][-40:] != wallet or "0x" + words[6][-40:] != USDC or "0x" + words[7][-40:] != WETH:
        raise ValueError("Unexpected recipient or assets")
    deltas = {USDC: 0, WETH: 0}
    for log in receipt["logs"]:
        token = log["address"].lower()
        topics = log["topics"]
        if token not in deltas or len(topics) != 3 or topics[0].lower() != TRANSFER:
            continue
        amount = int(log["data"], 16)
        if "0x" + topics[1][-40:].lower() == wallet:
            deltas[token] -= amount
        if "0x" + topics[2][-40:].lower() == wallet:
            deltas[token] += amount
    if deltas[USDC] != -int(words[0], 16) or deltas[WETH] < int(words[1], 16) or deltas[WETH] <= 0:
        raise ValueError("Receipt transfers do not match the reviewed swap")
    return Decimal(-deltas[USDC]) / Decimal(10**6), Decimal(deltas[WETH]) / Decimal(10**18)


class Journal:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=10)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("CREATE TABLE IF NOT EXISTS hedges (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")

    def get(self, key):
        row = self.db.execute("SELECT payload FROM hedges WHERE id=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def reserve(self, row):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            existing = self.get(row["id"])
            if existing:
                raise ValueError("This Base transaction already has a journal entry; use --reconcile")
            for (payload,) in self.db.execute("SELECT payload FROM hedges"):
                prior = json.loads(payload)
                if prior["state"] != "completed":
                    raise ValueError("An earlier hedge requires reconciliation; new execution is blocked")
            self.db.execute("INSERT INTO hedges VALUES (?, ?)", (row["id"], json.dumps(row)))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def save(self, row):
        with self.db:
            self.db.execute("UPDATE hedges SET payload=? WHERE id=?", (json.dumps(row), row["id"]))


def reconcile_order(row, order):
    if order.get("clientOrderId") != row["clientOrderId"]:
        raise ValueError("Order identity mismatch")
    filled = Decimal(str(order.get("filled") or 0))
    if filled < 0 or filled > Decimal(row["quantity"]):
        raise ValueError("Unexpected broker fill quantity")
    row["filledEth"] = str(filled)
    row["remainingExposureEth"] = str(Decimal(row["receivedWeth"]) - filled)
    row["orderId"] = order["id"]
    row["brokerStatus"] = order["status"]
    row["costUsdc"] = str(order.get("cost") or 0)
    row["fees"] = order.get("fees") or ([order["fee"]] if order.get("fee") else [])
    if order["status"] in ("closed", "canceled", "expired", "rejected"):
        row["state"] = "completed" if filled == Decimal(row["quantity"]) else "partial_fill" if filled else "no_fill"
    else:
        row["state"] = "open"
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tx", required=True, help="Specific Base transaction authorized for hedging")
    parser.add_argument("--wallet", required=True)
    parser.add_argument("--max-usdc", type=Decimal, required=True)
    parser.add_argument("--min-price", type=Decimal, required=True, help="Minimum Kraken USDC per ETH before fees")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--watch", action="store_true", help="Wait up to 15 minutes for the specified Base swap to finalize")
    parser.add_argument("--reconcile", action="store_true", help="Read broker state without placing an order")
    parser.add_argument("--journal", default=".hedge-state/kraken-base.sqlite")
    parser.add_argument("--env", help="Server-side credential file; never a VITE variable")
    args = parser.parse_args()
    if args.env:
        from dotenv import load_dotenv
        load_dotenv(args.env, override=False)
    if not args.max_usdc.is_finite() or not args.min_price.is_finite() or args.max_usdc <= 0 or args.min_price <= 0:
        raise ValueError("Positive finite limits required")
    import ccxt
    exchange = ccxt.kraken({"apiKey": os.environ.get("KRAKEN_API_KEY", ""),
                            "secret": os.environ.get("KRAKEN_API_SECRET", ""), "enableRateLimit": True, "timeout": 15000})
    symbol = "ETH/USDC"
    exchange.load_markets()
    market = exchange.market(symbol)
    if not market.get("spot") or market.get("active") is False:
        raise ValueError("Kraken ETH/USDC spot is unavailable")
    key = args.tx.lower()
    journal = Journal(args.journal)
    existing = journal.get(key)
    if args.reconcile:
        if not existing:
            raise ValueError("No journal entry")
        if existing.get("orderId"):
            orders = [exchange.fetch_order(existing["orderId"], symbol)]
        else:
            # Limited history intentionally fails closed; absence is never permission to retry.
            orders = exchange.fetch_open_orders(symbol) + exchange.fetch_closed_orders(symbol, existing["createdAt"] - 60000)
        matches = [o for o in orders if o.get("clientOrderId") == existing["clientOrderId"]]
        if len(matches) != 1:
            raise ValueError("Order remains uncertain. Inspect Kraken history; do not resubmit")
        journal.save(reconcile_order(existing, matches[0]))
        print(json.dumps(existing, indent=2)); return
    if existing:
        print(json.dumps(existing, indent=2)); return
    if rpc("eth_chainId", []) != "0x2105":
        raise ValueError("Base mainnet is required")
    deadline = time.monotonic() + (900 if args.watch else 0)
    while True:
        receipt = rpc("eth_getTransactionReceipt", [key])
        finalized = rpc("eth_getBlockByNumber", ["finalized", False])
        if receipt and int(receipt["blockNumber"], 16) <= int(finalized["number"], 16):
            break
        if time.monotonic() >= deadline:
            break
        time.sleep(5)
    if not receipt:
        raise ValueError("Base transaction has no receipt yet; retry the read-only preview later")
    if int(receipt["blockNumber"], 16) > int(finalized["number"], 16):
        raise ValueError("Base swap is not finalized yet; no Kraken order submitted")
    block = rpc("eth_getBlockByNumber", [receipt["blockNumber"], False])
    if block["hash"] != receipt["blockHash"]:
        raise ValueError("Receipt block is not canonical")
    spent, received = confirmed_swap(rpc("eth_getTransactionByHash", [key]), receipt, args.wallet)
    if spent > args.max_usdc:
        raise ValueError("Swap exceeds authorized USDC budget")
    held_weth = int(rpc("eth_call", [{"to": WETH, "data": "0x70a08231" + args.wallet[2:].lower().zfill(64)}, "latest"]), 16)
    if Decimal(held_weth) / Decimal(10**18) < received:
        raise ValueError("Base wallet no longer holds the WETH received; review existing exposure")
    quantity = exchange.amount_to_precision(symbol, received)
    price = exchange.price_to_precision(symbol, args.min_price)
    if Decimal(price) < args.min_price:
        raise ValueError("Minimum price must match Kraken tick precision; rounding would weaken the bound")
    limits = market["limits"]
    if Decimal(quantity) <= 0 or Decimal(quantity) < Decimal(str(limits["amount"].get("min") or 0)) or Decimal(quantity) * Decimal(price) < Decimal(str(limits["cost"].get("min") or 0)):
        raise ValueError("Hedge is below Kraken minimum size")
    balance = exchange.fetch_balance()
    if Decimal(str(balance.get("free", {}).get("ETH") or 0)) < Decimal(quantity):
        raise ValueError("Insufficient prefunded Kraken ETH inventory")
    fee = exchange.fetch_trading_fee(symbol).get("taker")
    if fee is None or not 0 <= Decimal(str(fee)) < 1:
        raise ValueError("Account fee unavailable")
    quote_started = time.monotonic()
    book = exchange.fetch_order_book(symbol, 100)
    if time.monotonic() - quote_started > 5 or (book.get("timestamp") and time.time() * 1000 - book["timestamp"] > 5000):
        raise ValueError("Kraken order book is stale; no order submitted")
    available = sum(Decimal(str(qty)) for px, qty in book["bids"] if Decimal(str(px)) >= Decimal(price))
    if available < Decimal(quantity):
        raise ValueError("Insufficient Kraken depth at the minimum price")
    row = {"id": key, "createdAt": int(time.time() * 1000), "state": "submitting",
           "wallet": args.wallet.lower(), "blockHash": receipt["blockHash"], "symbol": symbol,
           "clientOrderId": "sd" + hashlib.sha256(key.encode()).hexdigest()[:16],
           "quantity": quantity, "limitPrice": price, "receivedWeth": str(received), "spentUsdc": str(spent),
           "expectedFeeRate": str(fee), "remainingExposureEth": str(received),
           "minimumProceedsBeforeGasUsdc": str(Decimal(quantity) * Decimal(price) * (1 - Decimal(str(fee))))}
    if not args.execute:
        row["state"] = "preview"
        print(json.dumps(row, indent=2)); return
    if os.environ.get("HEDGE_LIVE_ENABLED") != "true":
        raise ValueError("Live hedging is not authorized: HEDGE_LIVE_ENABLED must be true")
    if time.time() - int(block["timestamp"], 16) > 3600:
        raise ValueError("Swap is older than one hour; review inventory manually")
    # Persist the unique ID before the irreversible request. No automatic retry, even on timeout.
    journal.reserve(row)
    try:
        order = exchange.create_order(symbol, "limit", "sell", float(quantity), float(price),
                                      {"timeInForce": "IOC", "cl_ord_id": row["clientOrderId"], "oflags": "fciq"})
        row["orderId"] = order["id"]
        row["state"] = "submitted"
        journal.save(row)
        for _ in range(10):
            reconcile_order(row, exchange.fetch_order(row["orderId"], symbol))
            journal.save(row)
            if row["state"] in TERMINAL:
                break
            time.sleep(1)
    except Exception:
        row["state"] = "uncertain"
        journal.save(row)
        raise RuntimeError("Submission or reconciliation uncertain; run --reconcile. No retry was submitted") from None
    print(json.dumps(row, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # ccxt exceptions may include request credentials; do not print them.
        print(json.dumps({"error": str(error) if type(error) in (ValueError, RuntimeError) else "Hedge operation failed; inspect local state", "ordersRetried": False}))
        raise SystemExit(1)
