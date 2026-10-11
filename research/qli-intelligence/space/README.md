---
title: QLi Shadow Research
emoji: "🧠"
colorFrom: gray
colorTo: yellow
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
python_version: "3.11"
license: apache-2.0
pinned: false
---

# Quantum QLi — Shadow Engine Research

This portable Hugging Face Space is a **synthetic, offline** demonstration of
QLi's experimental constant-product stress simulation. It never connects to
Solana, a user's wallet, a live liquidity pool or a model provider.

The controls use made-up integer reserve values. All five scenarios are
hypothetical, not Meteora DBC calculations or predictions.

**No deployment has been made from this GitHub repository.** To publish, an
authorized QLi project operator must create a Hugging Face Space and upload
only the contents of this folder. No HF_TOKEN is required by this offline
demo. Do not upload private user data or a wallet seed phrase.

A domain-separated SHA-256 integrity digest accompanies each synthetic
run. It is neither a signature nor a blockchain attestation.

To run locally:

```bash
python -m pip install "gradio==5.49.1"
python app.py
```

To verify the pure math first, from repository root:

```bash
python -m unittest discover -s research/qli-intelligence/space -p 'test_*.py'
```
