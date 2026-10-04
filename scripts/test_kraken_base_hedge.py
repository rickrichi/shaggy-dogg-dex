import tempfile
import unittest
from pathlib import Path
from kraken_base_hedge import Journal, reconcile_order, confirmed_swap, USDC, WETH, ROUTER, TRANSFER


class HedgeTests(unittest.TestCase):
    def test_uncertain_submission_survives_restart_and_blocks_new_orders(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "state.sqlite")
            journal = Journal(path)
            journal.reserve({"id": "tx1", "state": "submitting"})
            journal.db.close()
            restarted = Journal(path)
            self.assertEqual(restarted.get("tx1")["state"], "submitting")
            with self.assertRaises(ValueError):
                restarted.reserve({"id": "tx1", "state": "submitting"})
            with self.assertRaises(ValueError):
                restarted.reserve({"id": "tx2", "state": "submitting"})
            restarted.db.close()

    def test_partial_fill_records_actual_exposure(self):
        row = {"clientOrderId": "abc", "quantity": "1.5", "receivedWeth": "1.500000001"}
        order = {"clientOrderId": "abc", "id": "kraken-id", "filled": 0.5, "status": "canceled", "cost": 1000}
        self.assertEqual(reconcile_order(row, order)["state"], "partial_fill")
        self.assertEqual(row["remainingExposureEth"], "1.000000001")
        order["clientOrderId"] = "other"
        with self.assertRaises(ValueError):
            reconcile_order(row, order)

    def test_receipt_requires_exact_assets_and_recipient(self):
        # ABI/receipt fixtures use canonical Base token addresses, no token contracts are mocked or deployed.
        wallet = "0x" + "12" * 20
        word = lambda value: hex(value)[2:].zfill(64)
        addr = lambda value: value[2:].zfill(64)
        data = "0x38ed1739" + "".join([word(1000000), word(100), word(160), addr(wallet), word(9999999999), word(2), addr(USDC), addr(WETH)])
        tx = {"hash": "tx", "from": wallet, "to": ROUTER, "input": data}
        receipt = {"status": "0x1", "transactionHash": "tx", "logs": [
            {"address": USDC, "topics": [TRANSFER, "0x" + addr(wallet), "0x" + addr(ROUTER)], "data": hex(1000000)},
            {"address": WETH, "topics": [TRANSFER, "0x" + addr(ROUTER), "0x" + addr(wallet)], "data": hex(100)},
        ]}
        self.assertEqual(str(confirmed_swap(tx, receipt, wallet)[0]), "1")
        receipt["logs"][1]["address"] = USDC
        with self.assertRaises(ValueError):
            confirmed_swap(tx, receipt, wallet)


if __name__ == "__main__":
    unittest.main()
