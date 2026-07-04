#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
import re
from pathlib import Path

LOG = Path("logs/ble-observe-probe.log")
LINE_RE = re.compile(r"^(?P<ts>\d+) notify char=(?P<char>\S+) payload=(?P<payload>[0-9A-F ]+)$")


def parse_payload(payload: str) -> tuple[int, ...]:
    return tuple(int(part, 16) for part in payload.split())


def pairs(bytes_: tuple[int, ...]) -> list[tuple[int, int]]:
    body = bytes_[4:]
    return [(body[i], body[i + 1]) for i in range(0, len(body) - 1, 2)]


def main() -> None:
    lines = LOG.read_text().splitlines()
    events: list[tuple[int, str, tuple[int, ...]]] = []
    for line in lines:
        match = LINE_RE.match(line)
        if not match:
            continue
        payload = parse_payload(match.group("payload"))
        # c305 and c306 are duplicate notification streams. Analyze c305 only.
        if "c305" not in match.group("char"):
            continue
        events.append((int(match.group("ts")), match.group("char"), payload))

    print(f"events(c305)={len(events)}")
    print()

    print("unique payloads:")
    for payload, count in Counter(payload for _, _, payload in events).most_common():
        print(f"{count:>3}  {' '.join(f'{byte:02X}' for byte in payload):<54} pairs={pairs(payload)}")

    print()
    print("timeline:")
    previous_ts = None
    for ts, _, payload in events:
        delta = 0 if previous_ts is None else ts - previous_ts
        previous_ts = ts
        print(f"{ts} +{delta:>4}ms  {' '.join(f'{byte:02X}' for byte in payload):<54} pairs={pairs(payload)}")


if __name__ == "__main__":
    main()
