---
id: qli-operator
title: QLi Operator
group: Operations
summary: Strategy controls and reviewed scheduling previews, not background execution.
---

# QLi Operator

## Strategy session

Open `/agent`. Choose Observe, Guarded or Autonomous; choose a target demo pool and configure strategy controls such as bands, thresholds and limits. Save a snapshot to the session strategy repository; returning to the page loads the saved pool, controls, modules and pause conditions.

## Preview before action

Strategy execution produces a reviewed plan describing the operation and checkpoints. Observe does not execute writes. Guarded describes explicit wallet approval for proposed actions. Autonomous is a scheduling preview only: there is no unattended signer or background trading service.

## Reset and persistence

Strategies belong to the shared console provider, not a production metadata database. Refreshing loses them. System reset clears session strategies, events, policies, mode and open plans without modifying any wallet account.

See [Transaction review](/docs?article=wallet-flow) and [Adapter boundaries](/docs?article=limitations).