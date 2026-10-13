#!/usr/bin/env python3
"""
Cross-file linter for the AEOS spec pipeline.

JSON Schema validates each file's shape. This checks the invariants that span
files and IDs — the things a schema structurally cannot see:

  - every reference points at an ID that exists
  - every RECLASSIFIED question's `becomes` actually resolves to a resolved item
  - every blocking/high absence in the inventory is addressed in decisions
  - every ASSUMED decision reached the register
  - precedence and source references are internally consistent
  - no resolution text looks like an implementation

Usage:
    python lint_decisions.py <feature-dir> [--register PATH] [--schemas DIR]

Exit code 0 = clean, 1 = errors. Warnings never fail the build.
Reads YAML if PyYAML is present, else falls back to JSON.
"""
import sys, json, argparse, pathlib, re

def _isoify(o):
    """YAML parses unquoted dates into date/datetime objects; the contract types
    them as strings (format: date). Coerce back so schema validation matches."""
    import datetime
    if isinstance(o, dict):
        return {k: _isoify(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_isoify(v) for v in o]
    if isinstance(o, (datetime.date, datetime.datetime)):
        return o.isoformat()
    return o

def load(p):
    p = pathlib.Path(p)
    if not p.exists():
        return None
    text = p.read_text()
    try:
        import yaml
        return _isoify(yaml.safe_load(text))
    except ImportError:
        return json.loads(text)

def ids(seq, key="id"):
    return {x[key] for x in (seq or []) if isinstance(x, dict) and key in x}

# Heuristics for "this resolution describes HOW, not WHAT"
IMPL_MARKERS = [
    r"\bCRDT\b", r"\buse a\b .*\b(table|queue|cache|index|column)\b",
    r"\b(postgres|redis|kafka|s3|dynamo)\b", r"\bstore (it|them|this) in\b",
    r"\b(useState|useEffect|websocket|polling)\b", r"\badd a .*\b(field|table|endpoint)\b",
]

class Linter:
    def __init__(self):
        self.errors, self.warnings = [], []
    def err(self, msg): self.errors.append(msg)
    def warn(self, msg): self.warnings.append(msg)

    def run(self, feature_dir, register_path, schemas_dir):
        d = pathlib.Path(feature_dir)
        inv = load(d / "feature-inventory.yaml")
        dec = load(d / "decisions.yaml")
        reg = load(register_path) if register_path else None

        if inv is None: self.err(f"no feature-inventory.yaml in {d}")
        if dec is None: self.err(f"no decisions.yaml in {d}")
        if self.errors: return self.report()

        if schemas_dir:
            self.schema_check(inv, dec, reg, pathlib.Path(schemas_dir))

        self.check_precedence(inv)
        self.check_source_refs(inv)
        self.check_reference_targets(inv, dec)
        self.check_reclassification(inv, dec)
        self.check_absence_coverage(inv, dec)
        self.check_conflict_coverage(inv, dec)
        self.check_register(dec, reg)
        self.check_no_implementations(dec)
        self.check_unmapped(inv, dec)
        return self.report()

    # ---- optional JSON Schema pass ----
    def schema_check(self, inv, dec, reg, sdir):
        try:
            import jsonschema
        except ImportError:
            self.warn("jsonschema not installed — skipping shape validation (run check-jsonschema separately)")
            return
        pairs = [(inv, "feature-inventory.schema.json"), (dec, "decisions.schema.json")]
        if reg is not None: pairs.append((reg, "assumption-register.schema.json"))
        for doc, name in pairs:
            sp = sdir / name
            if not sp.exists():
                self.warn(f"schema {name} not found — skipping")
                continue
            try:
                jsonschema.validate(doc, json.loads(sp.read_text()))
            except jsonschema.ValidationError as e:
                loc = "/".join(str(x) for x in e.absolute_path) or "(root)"
                self.err(f"{name}: {loc}: {e.message}")

    # ---- cross-file invariants ----
    def check_precedence(self, inv):
        srcs = ids(inv.get("meta", {}).get("sources"), "id")
        for s in inv.get("meta", {}).get("source_precedence", []):
            if s not in srcs:
                self.err(f"source_precedence lists {s}, not in meta.sources")
        if srcs and set(inv["meta"].get("source_precedence", [])) != srcs:
            missing = srcs - set(inv["meta"].get("source_precedence", []))
            if missing:
                self.warn(f"sources not ranked in precedence: {sorted(missing)}")

    def check_source_refs(self, inv):
        srcs = ids(inv.get("meta", {}).get("sources"), "id")
        for sec in ["screens", "states", "interactions", "data", "transitions"]:
            for item in inv.get(sec) or []:
                s = item.get("source")
                if s and s not in srcs:
                    self.err(f"{sec} {item.get('id')} cites {s}, not in meta.sources")
        for c in inv.get("conflicts") or []:
            for pos in c.get("positions", []):
                if pos.get("source") not in srcs:
                    self.err(f"conflict {c.get('id')} position cites {pos.get('source')}, not in meta.sources")

    def check_reference_targets(self, inv, dec):
        con_ids = ids(inv.get("conflicts"))
        abs_ids = ids(inv.get("absences"))
        q_ids = ids(inv.get("questions"))
        # decisions must reference real inventory items
        for r in dec.get("conflict_resolutions") or []:
            if r.get("conflict") not in con_ids:
                self.err(f"conflict_resolution references {r.get('conflict')}, absent from inventory")
        for r in dec.get("decisions") or []:
            if r.get("absence") not in abs_ids | q_ids:  # a reclassified Q may land here as new ABS
                # allow NEW-* created off-inventory
                if not re.match(r"^(ABS|NEW)-", str(r.get("absence"))):
                    self.err(f"decision references {r.get('absence')}, absent from inventory")
        for r in dec.get("question_resolutions") or []:
            if r.get("question") not in q_ids:
                self.err(f"question_resolution references {r.get('question')}, absent from inventory")
        # blocks must point at real ids
        allf = con_ids | abs_ids
        for q in inv.get("questions") or []:
            for b in q.get("blocks", []):
                if b not in allf:
                    self.warn(f"question {q.get('id')} blocks {b}, which is not a known finding")

    def check_reclassification(self, inv, dec):
        """The headline check: a RECLASSIFIED question's `becomes` must resolve."""
        resolved_con = {r["conflict"] for r in dec.get("conflict_resolutions") or [] if "conflict" in r}
        resolved_abs = {r["absence"] for r in dec.get("decisions") or [] if "absence" in r}
        resolved = resolved_con | resolved_abs
        for r in dec.get("question_resolutions") or []:
            if r.get("outcome") != "RECLASSIFIED":
                continue
            becomes = r.get("becomes")
            if not becomes:
                self.err(f"{r.get('question')} RECLASSIFIED but has no `becomes`")
            elif becomes not in resolved:
                self.err(f"{r.get('question')} reclassified to {becomes}, which is never resolved in this session "
                         f"— an orphaned reclassification looks handled and isn't")

    def check_absence_coverage(self, inv, dec):
        addressed = {r["absence"] for r in dec.get("decisions") or [] if "absence" in r}
        for a in inv.get("absences") or []:
            if a.get("description") == "none-found":
                continue
            if a.get("severity") in ("blocking", "high") and a["id"] not in addressed:
                self.err(f"{a['id']} ({a.get('severity')}) is unaddressed in decisions.yaml")
            elif a["id"] not in addressed:
                self.warn(f"{a['id']} (normal) not addressed — should have been swept to ASSUMED")

    def check_conflict_coverage(self, inv, dec):
        addressed = {r["conflict"] for r in dec.get("conflict_resolutions") or [] if "conflict" in r}
        for c in inv.get("conflicts") or []:
            if c.get("requires_human") and c["id"] not in addressed:
                self.err(f"{c['id']} requires_human but is unresolved in decisions.yaml")

    def check_register(self, dec, reg):
        assumed = {r["absence"] for r in dec.get("decisions") or [] if r.get("outcome") == "ASSUMED"}
        if not assumed:
            return
        if reg is None:
            self.err(f"{len(assumed)} ASSUMED decisions but no assumption-register.yaml found")
            return
        registered_from = {a.get("from") for a in reg.get("assumptions") or []}
        for a in assumed:
            if a not in registered_from:
                self.err(f"ASSUMED {a} never reached the assumption register")

    def check_no_implementations(self, dec):
        for r in (dec.get("decisions") or []) + (dec.get("conflict_resolutions") or []):
            text = r.get("resolution", "")
            for pat in IMPL_MARKERS:
                if re.search(pat, text, re.I):
                    self.warn(f"resolution for {r.get('absence') or r.get('conflict')} may describe "
                              f"implementation, not behaviour: matched /{pat}/")
                    break

    def check_unmapped(self, inv, dec):
        unmapped = [d["id"] for d in inv.get("data") or [] if d.get("glossary_term") == "UNMAPPED"]
        if unmapped:
            self.warn(f"{len(unmapped)} UNMAPPED glossary terms in inventory: {unmapped} "
                      f"— resolve or escalate before spec writing")

    def report(self):
        for w in self.warnings: print(f"  warn: {w}")
        for e in self.errors: print(f" ERROR: {e}")
        if self.errors:
            print(f"\n{len(self.errors)} error(s), {len(self.warnings)} warning(s)")
            return 1
        print(f"clean ({len(self.warnings)} warning(s))")
        return 0

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("feature_dir")
    ap.add_argument("--register", default=None, help="path to assumption-register.yaml")
    ap.add_argument("--schemas", default=None, help="dir of *.schema.json for shape validation")
    a = ap.parse_args()
    sys.exit(Linter().run(a.feature_dir, a.register, a.schemas))

if __name__ == "__main__":
    main()
