"""Sum token usage and API-equivalent cost from Claude Code agent transcripts (JSONL).

Usage: python usage_cost.py <agent.jsonl> [<agent.jsonl> ...]

Prices: USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing (read 2026-10-22).
The account runs on a subscription plan, so this is what the same tokens would cost on the API.
"""
import datetime as dt
import json
import sys

PRICES = {  # input, 5m cache write, 1h cache write, cache read, output
    "claude-opus-5-5": (4.0, 5.0, 8.0, 0.20, 20.0),
    "claude-sonnet-5-5": (2.0, 2.5, 4.0, 0.10, 10.0),
    "claude-haiku-5-5": (0.10, 0.125, 0.20, 0.01, 0.50),
    "claude-fable-5-1": (10.0, 12.5, 20.0, 0.25, 50.0),
}


def summarize(path):
    seen, totals, models, stamps = set(), dict.fromkeys(("input", "write_5m", "write_1h", "read", "output"), 0), set(), []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("timestamp"):
                stamps.append(record["timestamp"])
            message = record.get("message")
            if not isinstance(message, dict) or "usage" not in message or message.get("id") in seen:
                continue
            seen.add(message.get("id"))
            models.add(message.get("model", "?"))
            usage = message["usage"]
            split = usage.get("cache_creation") or {}
            write_1h = split.get("ephemeral_1h_input_tokens", 0)
            totals["input"] += usage.get("input_tokens", 0)
            totals["write_1h"] += write_1h
            totals["write_5m"] += usage.get("cache_creation_input_tokens", 0) - write_1h
            totals["read"] += usage.get("cache_read_input_tokens", 0)
            totals["output"] += usage.get("output_tokens", 0)
    cost = 0.0
    for model in models:
        price = PRICES.get(model)
        if price and len(models) == 1:
            cost = sum(totals[k] * p for k, p in zip(totals, price)) / 1e6
    times = sorted(dt.datetime.fromisoformat(s.replace("Z", "+00:00")) for s in stamps)
    minutes = (times[-1] - times[0]).total_seconds() / 60 if times else 0
    return models, totals, cost, times, minutes


def main(paths):
    for path in paths:
        models, totals, cost, times, minutes = summarize(path)
        print(path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1])
        print(f"  model(s): {', '.join(sorted(models))}")
        if times:
            print(f"  wall clock: {times[0]:%Y-%m-%d %H:%M} -> {times[-1]:%H:%M} UTC, {minutes:.0f} min")
        print("  tokens: " + ", ".join(f"{k} {v:,}" for k, v in totals.items()) + f", all {sum(totals.values()):,}")
        print(f"  API-equivalent cost: ${cost:.2f}" if cost else "  cost: model not in price table")


if __name__ == "__main__":
    main(sys.argv[1:])
