import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sync_pairs', Path(__file__).with_name('sync-market-pairs.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MergeTests(unittest.TestCase):
    def test_preserves_other_settings_and_existing_extra_pairs(self):
        original = 'APCA_API_KEY_ID=example\nCS_PORT=8080\nCS_STREAM_SYMBOLS=["BTC-USD","ETH/BTC"]\n'
        updated = module.merge_setting(original, 'CS_STREAM_SYMBOLS', ['ETH/BTC', 'AERO/USDC'])
        self.assertIn('APCA_API_KEY_ID=example\nCS_PORT=8080\n', updated)
        symbols = json.loads(updated.split('CS_STREAM_SYMBOLS=')[1])
        self.assertEqual(symbols, ['BTC/USD', 'ETH/BTC', 'AERO/USDC'])
        self.assertEqual(module.merge_setting(updated, 'CS_STREAM_SYMBOLS', ['AERO/USDC']), updated)

    def test_invalid_existing_json_is_not_overwritten(self):
        with self.assertRaises(ValueError):
            module.merge_setting('CS_STREAM_SYMBOLS=[invalid]', 'CS_STREAM_SYMBOLS', ['ETH/BTC'])

if __name__ == '__main__':
    unittest.main()
