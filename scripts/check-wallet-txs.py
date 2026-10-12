import json
import urllib.request

alchemy_url = 'https://base-mainnet.g.alchemy.com/v2/***REMOVED***'
wallet = '0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98'

def get_transfers(direction):
    param = {'fromAddress': wallet} if direction == 'from' else {'toAddress': wallet}
    payload = {
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'alchemy_getAssetTransfers',
        'params': [{
            **param,
            'category': ['external', 'erc20'],
            'withMetadata': True,
            'order': 'desc'
        }]
    }
    req = urllib.request.Request(alchemy_url, data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode()).get('result', {}).get('transfers', [])

out_tx = get_transfers('from')
in_tx = get_transfers('to')

print(f"Total Outbound Transfers: {len(out_tx)}")
for t in out_tx:
    print(f"OUT: {t.get('hash')} | asset: {t.get('asset')} | value: {t.get('value')} | to: {t.get('to')}")

print(f"\nTotal Inbound Transfers: {len(in_tx)}")
for t in in_tx:
    print(f"IN:  {t.get('hash')} | asset: {t.get('asset')} | value: {t.get('value')} | from: {t.get('from')}")
