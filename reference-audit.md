# Quantum QLi public parity inventory

Reference inspected directly with Chromium on 9 October 2026. Implementation is independent; no proprietary source or private accounts were accessed.

## Public surfaces

- `/`: retro desktop title bar, full navigation, brand icon, API introduction, health metrics/history chart, algorithm availability table, three-tab browser crypto playground, message/tamper control, run/reset and results.
- `/markets`: three algorithm selectors, inspector, standards/operation/security details, playground/docs links, threat warning.
- `/api-docs`: implemented/planned endpoints, validation limits, request identifiers, cURL/JavaScript/Python examples.
- `/launch`: token metadata, PNG/JPEG/WebP upload (5 MB), website/X/Telegram, pair selector, initial buy, slippage, priority fee, vanity toggle, wallet flow.
- `/launches`: launched-token table with mint, creator, date and explorer transaction links.
- `/explore`: search/submit, refresh, volume/cap/gainers/losers sort, market table, unavailable feed state.
- `/terminal`: feed status, timestamp/count, 10-second refresh, filter/sort, token selection, buy/sell, amount presets, slippage/priority and wallet flow.
- `/trending`: market table and unavailable live-price state.
- `/portfolio`: wallet connection, SOL/token-account counters, holdings, transaction history.
- `/vault`: subnavigation, TVL/wallet/vault/RPC counters, security checklist, balances and activity.
- `/vaults`: local ML-DSA key generation, fingerprint, backup/restore seed form, unavailable vault state.
- `/deposit`: amount, availability, undeployed-program disabled state.
- `/withdraw`: amount/destination, local sign/verify, undeployed submission.
- `/security`: ordinary-wallet vs PQ authorization, status report, limitations and four blockers.
- `/activity`: confirmed Devnet signatures and wallet-empty state.
- `/docs`: vault overview, backup, loss, phases and launch documentation.

## Reference limitations observed

Market feeds were unavailable on Explore, Terminal and Trending. Vault creation, deposit, withdrawal and registration were explicitly unavailable: no deployed program. Custodial signing/key storage, decapsulation and per-project usage were planned, not implemented. Only SOL launch pairing was enabled. Public wallet UI is browser-wallet driven; no email/password flow was observed.

## Implementation policy

Recreate the retro desktop visual language and public routes. Keep the stronger DBC launch wizard, arbitrary-quote registry, WOTS identity, verification, liquidity console and reviewed signing. Use explicit selectable demo market adapters rather than fabricate live prices. Implement actual ML-DSA/SLH-DSA/ML-KEM operations; keep secret keys in tab memory, never in persistent storage. Public crypto APIs receive public material only. Quantum custody remains unavailable without an independently reviewed, deployed program.

## Final self-audit

- All 16 public surfaces and 10 additional retained operations/product routes responded successfully with Quantum QLi document titles and no browser page errors.
- Browser flows verified real ML-DSA and SLH-DSA signatures, ML-KEM encapsulation/decapsulation, tamper rejection, window controls, wallet connection modal, market search, order review/validation, vault local key generation, restore validation, local withdrawal signature, disabled live withdrawal and settings save.
- Retained flows verified four-stage identity navigation, registration consuming leaf zero, demo-anchor blocking, fresh possession proof, seven-step Standard/Quantum launch review, 61-quote catalog/search, local Attestation Seal, all three valid/tampered verification categories, searchable docs and WOTS chunk staging.
- Desktop/tablet/mobile layouts checked at 1280, 768 and 390 px; mobile navigation worked and tested routes had no page-level horizontal overflow.
- Fixed self-audit omissions: terminal label escaping, stable launch symbols/sorting, asynchronous demo-load race, stale withdrawal result after asset changes, complete metadata public proofs, executable cURL examples and backup/lost-key/readiness documentation.
- Health history records actual self-tests only in volatile worker memory; no invented uptime. Build/typecheck diagnostics reported build OK. Cryptographic domains and consumed-leaf storage retain legacy versioned encodings for existing proof compatibility and leaf safety.
- Unavailable integrations remain explicit: live market/trading provider, deployed Quantum QLi vault verifier, custodial API operations and production launch certificate integration. Wallet-extension signing cannot be tested in headless Chromium without an installed wallet; simulated plans never sign or submit.
