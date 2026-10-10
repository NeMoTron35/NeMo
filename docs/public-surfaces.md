---
id: public-surfaces
title: Markets, Trending and Portfolio
group: Public surfaces
summary: Algorithm Atlas, explicit demo markets and read-only wallet views.
---

# Markets, Trending and Portfolio

## Routes and purpose

| Surface         | Route        | Current behavior                                                                         |
| --------------- | ------------ | ---------------------------------------------------------------------------------------- |
| Algorithm Atlas | `/markets`   | Three PQ algorithm inspectors, standards, operation availability and workbench/API links |
| Explore         | `/explore`   | Market search, refresh, sort and explicit live-unavailable/demo selection                |
| Trade Console   | `/terminal`  | Refresh/status, token selection, buy/sell inputs, amount presets and order review        |
| Trending        | `/trending`  | Market table with unavailable live feed and selectable demonstration                     |
| Launch History  | `/launches`  | Demonstration launch rows; explorer links are not proof of execution                     |
| Portfolio       | `/portfolio` | Connected-wallet SOL/token-account reads and transaction view where RPC permits          |
| Wallet Events   | `/activity`  | Read-only Devnet signatures                                                              |

## Market demonstrations

Demo prices, mints, market caps and volumes are not sourced from a live trading provider. Search/sort/filter change the displayed sample set. Terminal refresh can report unavailable data; demo orders only produce review plans and never executable swaps.

## Read-only portfolio

Connect the intended wallet and check network/RPC health. An empty view may mean no connection, no returned accounts or an RPC error. Inventory at `/positions` is separate demo liquidity data.