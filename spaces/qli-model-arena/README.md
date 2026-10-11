---
title: QLi Model Arena
sdk: gradio
app_file: app.py
---

# QLi Model Arena (prototype export — NOT PUBLISHED)

Deterministic scorer for openly SYNTHETIC fixtures (`fixtures.json`, generated from `src/lib/qli-core/neural/arena.ts`). Contains no user data, wallet addresses or chain data. Scores: valid JSON, citation grounding, address leakage, correct refusal of signing/key requests. It does not call any model.