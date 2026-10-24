#!/usr/bin/env python3
"""Print the next ready ticket and the ledger totals.

Rule (tickets/README.md): work the phases in order; in the current phase take the
lowest-numbered ticket whose dependencies are all passed. A dependency on a base ID
is already expanded to all lettered parts in tickets.json.
A blocked ticket is skipped; tickets that depend on it wait.
Usage: python3 tools/next_ticket.py            (from the vault root)
"""
import json, os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tickets")
T = json.load(open(os.path.join(root, "tickets.json")))
L = json.load(open(os.path.join(root, "status.json")))["tickets"]
by = {t["id"]: t for t in T["tickets"]}
VALID = {"not started", "in progress", "passed", "blocked"}
errs = [i for i in by if i not in L] + [i for i in L if i not in by]
errs += [i for i, s in L.items() if s["status"] not in VALID]
errs += [i for i, s in L.items() if s["status"] == "passed" and not s.get("commit")]
errs += [i for i, s in L.items() if s["status"] == "blocked" and not s.get("note")]
if errs:
    sys.exit("Ledger problems (missing, unknown status, passed without commit, blocked without note): " + ", ".join(sorted(set(errs))))
key = lambda i: (int(re.match(r"EZD-(\d+)", i).group(1)), i)
passed = {i for i, s in L.items() if s["status"] == "passed"}
counts = {}
for s in L.values():
    counts[s["status"]] = counts.get(s["status"], 0) + 1
print("Ledger:", ", ".join(f"{v} {k}" for k, v in sorted(counts.items())), f"of {len(by)}")
for i, s in L.items():
    if s["status"] == "in progress":
        print("In progress:", i, by[i]["title"])
for ph in T["phases"]:
    open_ = sorted((i for i in ph["tickets"] if i not in passed), key=key)
    if not open_:
        continue
    print(f"Current phase: {ph['phase']} · {ph['name']} ({len(open_)} of {len(ph['tickets'])} left)")
    for i in open_:
        if L[i]["status"] == "not started" and all(d in passed for d in by[i]["depends_on"]):
            t = by[i]
            print(f"Next ready: {i} {t['title']}")
            print("  Read:", ", ".join(t["spec_files"]) or "(see Spec ref)")
            print("  Spec ref:", t["spec_ref"])
            if t["mockups"]:
                print("  Mockup:", ", ".join(t["mockups"]))
            print("  Ticket text:", t["phase_file"])
            break
    else:
        print("No ready ticket in this phase. Waiting on:")
        for i in open_:
            w = [d for d in by[i]["depends_on"] if d not in passed]
            print(f"  {i} [{L[i]['status']}]", ("needs " + ", ".join(w)) if w else L[i].get("note", ""))
    break
else:
    print("All tickets passed.")
