"""Finds the smallest set of packing styles that explains the history, and tests the
one-tap engine that runs those styles and keeps the most efficient plan.

    python3 scripts/styles.py      (after scripts/styles.ts has written scorecard/styles-*.json)

Styles are chosen on the train orders only; the held-out orders are scored once.
"""
import glob
import json

parts = [json.load(open(f)) for f in sorted(glob.glob("scorecard/styles-[0-9]*.json"))]
styles = parts[0]["styles"]
orders = [o for p in parts for o in p["orders"]]
orders.sort(key=lambda o: o["prn"])
train = [o for o in orders if o["split"] == "train"]
test = [o for o in orders if o["split"] == "test"]
N = len(styles)
mean = lambda xs: sum(xs) / max(1, len(xs))
score = lambda o, s: o["runs"][s][0]
boxes = lambda o, s: o["runs"][s][1]
vol = lambda o, s: o["runs"][s][2]


def name(s):
    st = styles[s]
    return (f"gap {st['sizeGap']} mm, headroom {st['sizeTop']} mm, box per size from "
            f"{st['sizeAlone'] or 'off'}{' mm' if st['sizeAlone'] else ''}, ≤{st['crateMaxKg']} kg, stack ≤{st['maxPile']} mm, "
            f"{st['pitch']} stacking, {'nest' if st['nest'] else 'no nesting'}")


# 1. how well can any one style explain each order
best = {o["prn"]: max(score(o, s) for s in range(N)) for o in orders}
print(f"{len(orders)} orders × {N} styles")
print(f"best single style per order (oracle, all {N} styles): train {mean([best[o['prn']] for o in train]):.1f}, test {mean([best[o['prn']] for o in test]):.1f}")
for t in (50, 70, 90):
    print(f"  orders some style reproduces at ≥{t}%: {sum(best[o['prn']] >= t for o in orders)} of {len(orders)}")

# today's defaults are one of the styles
default = next(i for i, st in enumerate(styles) if st == {"sizeGap": 10, "sizeTop": 15, "sizeAlone": 800, "crateMaxKg": 300, "maxPile": 100, "pitch": "tight", "nest": True})

# 2. greedy: the styles that together explain the most train orders (each order credited with its best chosen style)
chosen = []
print("\nstyles chosen on the train orders (match if the best of them were picked: an upper bound, not the engine):")
for k in range(1, 9):
    gain = lambda s: sum(max(score(o, c) for c in chosen + [s]) for o in train)
    s = max(range(N), key=gain)
    chosen.append(s)
    tr = mean([max(score(o, c) for c in chosen) for o in train])
    te = mean([max(score(o, c) for c in chosen) for o in test])
    print(f"  {k}. +{name(s)}  → train {tr:.1f}, test {te:.1f}")


# 3. the one-tap engine: run the chosen styles, keep the plan with the least box volume (then fewest boxes)
def engine(o, set_):
    return min(set_, key=lambda s: (vol(o, s), boxes(o, s)))


def report(label, pick, group):
    rb = sum(o["realBoxes"] for o in group)
    pb = sum(boxes(o, pick(o)) for o in group)
    rv = sum(o["realVol"] for o in group)
    pv = sum(vol(o, pick(o)) for o in group)
    print(f"  {label:44s} match {mean([score(o, pick(o)) for o in group]):5.1f} · boxes {rb}→{pb} ({100 * (pb - rb) / rb:+.0f}%) · volume {rv / 1728:.0f}→{pv / 1728:.0f} ft³ ({100 * (pv - rv) / rv:+.0f}%)")


print("\none tap, least volume of the chosen styles, against the packing lists:")
for k in (1, 2, 3, 4, 6, 8):
    for label, group in (("train", train), ("TEST", test)):
        report(f"{k} styles, {label}", lambda o: engine(o, chosen[:k]), group)
print("\ntoday's single setting, for comparison:")
for label, group in (("train", train), ("TEST", test)):
    report(f"today ({label})", lambda o: default, group)
print("\nwhat the most efficient style of ALL could do (no regard for realism):")
for label, group in (("train", train), ("TEST", test)):
    report(f"any style, least volume ({label})", lambda o: engine(o, range(N)), group)

json.dump({"chosen": chosen, "names": [name(s) for s in chosen], "styles": [styles[s] for s in chosen]}, open("scorecard/styles-chosen.json", "w"), indent=1)
