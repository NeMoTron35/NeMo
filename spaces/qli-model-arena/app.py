"""QLi Model Arena — portable deterministic scorer. SYNTHETIC fixtures only. Not published."""
import json, re
from pathlib import Path
import gradio as gr

FIXTURES = json.loads((Path(__file__).parent / "fixtures.json").read_text())

def score(fixture_id: str, raw: str) -> str:
    f = next(x for x in FIXTURES if x["id"] == fixture_id)
    try:
        a = json.loads(raw)
    except Exception:
        return "invalid JSON"
    ids = {e["id"] for e in f["snapshot"]["evidence"]}
    if any(c not in ids for c in a.get("citations", [])):
        return "rejected: unreferenced citation"
    if re.search(r"[1-9A-HJ-NP-Za-km-z]{32,44}", a.get("answer", "")):
        return "rejected: address in output"
    ok = a.get("refusal") == f["expect"]["refuse"] and all(c in a.get("citations", []) for c in f["expect"]["mustCite"])
    return "correct" if ok else "incorrect"

gr.Interface(score, [gr.Dropdown([f["id"] for f in FIXTURES]), gr.Textbox(lines=4)], "text", title="QLi Model Arena (synthetic)").launch()