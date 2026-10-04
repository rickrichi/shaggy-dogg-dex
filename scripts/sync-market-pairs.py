"""Update only pair-list settings; preserve credentials and all other settings.

Default is a dry run. --apply writes the three sibling services' .env files.
Services load these settings at startup; this script does not restart processes.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def merge_setting(content: str, key: str, symbols: list[str]) -> str:
    pattern = re.compile(r'^' + re.escape(key) + r'\s*=.*$', re.MULTILINE)
    match = pattern.search(content)
    existing = []
    if match:
        value = match.group().split('=', 1)[1].strip().strip("'\"")
        try:
            existing = json.loads(value) if value.startswith('[') else value.split(',')
        except json.JSONDecodeError as exc:
            raise ValueError(f'{key}: invalid existing list; refusing to overwrite') from exc
    merged = list(dict.fromkeys([*(str(p).strip().upper().replace('-', '/') for p in existing), *symbols]))
    line = key + '=' + json.dumps(merged, separators=(',', ':'))
    return pattern.sub(lambda _: line, content) if match else content.rstrip() + '\n' + line + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    symbols = json.loads((ROOT / 'src/config/market-pairs.json').read_text())
    targets = [('cryptostream/.env', 'CS_STREAM_SYMBOLS'), ('shaggy-dogg-market-data/.env', 'MD_PAIRS'), ('crypto-arb/backend/.env', 'ARB_SYMBOLS')]
    changes = []
    for relative, key in targets:
        path = (ROOT.parent / relative).resolve()
        if not path.parent.is_dir():
            raise FileNotFoundError(f'Missing service directory: {path.parent}')
        original = path.read_text(encoding='utf-8-sig') if path.exists() else ''
        changes.append((path, key, merge_setting(original, key, symbols)))
    for path, key, updated in changes:
        if args.apply:
            path.write_text(updated, encoding='utf-8')
        print(f'{"Updated" if args.apply else "Would update"} {path}: {key} ({len(symbols)} catalog pairs; existing extras retained)')

if __name__ == '__main__':
    main()
