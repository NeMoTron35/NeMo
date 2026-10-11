"""Public QLi Model Arena / Shadow demonstration. Synthetic-only; no account connections."""
import gradio as gr
from engine import scenarios

DESCRIPTION = """
**QLi Shadow Engine — Experimental Research**

Simulate five counterfactual reserve shocks using exact integer constant-product math.
This demo contains **no real Solana RPC connection, Hugging Face inference, wallet,
trading, token address, or price prediction**. It is not a Meteora DBC quote.
"""

def run(reserve_in: int, reserve_out: int, amount_in: int, fee_bps: int):
    try:
        result = scenarios(int(reserve_in), int(reserve_out), int(amount_in), int(fee_bps))
        rows = [
            [r["scenario"], r["reserveIn"], r["reserveOut"], r["amountOut"]]
            for r in result["scenarios"]
        ]
        note = (
            f"**Output range (synthetic units):** {result['worstOutput']} to "
            f"{result['bestOutput']}\\n\\n"
            f"**Offline record SHA-256:** `{result['offchainSha256']}`\\n\\n"
            "**This hash is not signed and does not attest to real blockchain data.**"
        )
        return rows, note
    except (ValueError, ArithmeticError, TypeError) as exc:
        return [], "Input rejected: " + str(exc)

with gr.Blocks(title="QLi Shadow Engine — Research") as demo:
    gr.Markdown("# Quantum QLi | Shadow Research")
    gr.Markdown(DESCRIPTION)
    with gr.Row():
        reserve_in = gr.Number(value=100000, label="Synthetic reserve in (integer)", precision=0)
        reserve_out = gr.Number(value=200000, label="Synthetic reserve out (integer)", precision=0)
    with gr.Row():
        amount_in = gr.Number(value=1000, label="Synthetic input amount", precision=0)
        fee_bps = gr.Slider(minimum=0, maximum=1000, value=30, step=1, label="Hypothetical fee (basis points)")
    start = gr.Button("Run synthetic stress test", variant="primary")
    table = gr.Dataframe(
        headers=["Scenario", "Input reserve", "Output reserve", "Modeled output"],
        datatype=["str", "str", "str", "str"], interactive=False, label="Illustrative scenarios"
    )
    note = gr.Markdown("No test has been run.")
    start.click(run, inputs=[reserve_in, reserve_out, amount_in, fee_bps], outputs=[table, note])
    gr.Markdown(
        "Research-grade prototype only. No automated transaction, private data,"
        " wallet sign-in, live hosted-model benchmark, or mainnet vault authorization."
    )

if __name__ == "__main__":
    demo.launch()
