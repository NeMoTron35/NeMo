---
id: event-log
title: Event Log
group: Workspace
summary: Session operation journal, filters and JSON export.
---

# Event Log

Open `/audit`. Search titles/details and filter severity, event type and pool. Export the filtered view as `quantum-qli-audit-demo.json`; the payload marks the environment as simulation. Empty results mean no matching session events, not no chain activity.

## Session record

Initial events are demonstration data; later entries record local actions and reviewed-plan requests. It is not an immutable security log or a chain indexer. System reset clears the session journal.

## Separate wallet events

`/activity` queries read-only Devnet signatures for the connected wallet. It is distinct from Event Log and can be unavailable when RPC fails. Neither journal authorizes a transaction.