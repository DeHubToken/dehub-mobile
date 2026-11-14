#!/usr/bin/env python3
"""Turns the tour's result files into one before/after table.

    summary.py <dir with before-N.json and after-N.json> [pages]

With "pages" it reads the every-page tour instead (pages-before.json and
pages-after.json).

Each cell is the median over the rounds. "frozen" is the time lost to late
frames after the switch, "longest" the single longest stretch without a frame,
"free at" when the last late frame ended.
"""
import glob
import json
import os
import statistics
import sys

directory = sys.argv[1]
names = "pages-{}.json" if len(sys.argv) > 2 and sys.argv[2] == "pages" else "{}-*.json"


def load(variant):
    runs = []
    for path in sorted(glob.glob(os.path.join(directory, names.format(variant)))):
        try:
            data = json.load(open(path))
        except Exception:
            continue
        if data.get("steps"):
            runs.append(data)
    return runs


def median(values):
    return round(statistics.median(values)) if values else None


before, after = load("before"), load("after")
order = []
for run in before + after:
    for step in run["steps"]:
        if step["step"] not in order:
            order.append(step["step"])


def cell(runs, name, field):
    return median([s[field] for run in runs for s in run["steps"] if s["step"] == name])


def show(value):
    return "-" if value is None else f"{value}"


print(f"Runs: before {len(before)}, after {len(after)}. Times in ms, median of the runs.\n")
print("| switch | frozen before | frozen after | longest before | longest after | free at before | free at after |")
print("|---|---|---|---|---|---|---|")
totals = {"b": 0, "a": 0}
for name in order:
    b = [cell(before, name, f) for f in ("blockedMs", "worstMs", "settledMs")]
    a = [cell(after, name, f) for f in ("blockedMs", "worstMs", "settledMs")]
    totals["b"] += b[0] or 0
    totals["a"] += a[0] or 0
    print(f"| {name} | {show(b[0])} | {show(a[0])} | {show(b[1])} | {show(a[1])} | {show(b[2])} | {show(a[2])} |")
print(f"| all switches | {totals['b']} | {totals['a']} | | | | |")
for label, runs in (("before", before), ("after", after)):
    for run in runs:
        if run.get("error"):
            print(f"\n{label}: tour error: {run['error']}")
for label, runs in (("before", before), ("after", after)):
    swipes = [run["swipeBack"]["went"] for run in runs if "swipeBack" in run]
    if swipes:
        print(f"\nSwipe back from the left edge, {label}: went back in {sum(swipes)} of {len(swipes)} runs")
