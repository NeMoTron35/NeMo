# Agentic Creator Studio v1

Route: `/creator-studio`. A new QLi Operator module for original AI-generated characters and draft media packs tied to RPC-verified Meteora DBC evidence. Drafting only.

## What works

- **Agentic Identity**: named original personas (handle, personality, aesthetic, voice, character bible, template avatar/palette, optional DBC pool + network). Every persona carries the disclosure "AI-generated character". Preview is template-derived, not model media.
- **Media & Reels**: deterministic draft packs (script, timed 9:16 shot list, captions, X post drafts, review checklist), in-browser storyboard preview honoring reduced motion, JSON export. **MP4 export not configured.**
- **On-chain Content Verification**: evidence cards only from a successful server-trusted lifecycle read (genesis-checked, DBC-owned). Classes: A confirmed, B derived, C quote estimate (kept in Lifecycle Intelligence), D creative. A claim scanner flags promotional and unsupported factual sentences.
- **Provenance**: domain `QLI_CREATOR_MEDIA_PROVENANCE_V1`, SHA-256 over canonical sorted JSON of content + evidence. Integrity checksum only, not a signature or on-chain attestation.
- **Dashboard / inspector**: persona, draft, approval and Q&A counts; pool stage, slot, freshness and unclaimed creator fees when verified. Platform engagement: N/A.
- **Community Intelligence**: owner-moderated Q&A drafts; grounded answers only from verified pool state; refuses price/investment questions.
- **QLi Operator workflows**: "Prepare launch announcement pack", "Prepare this week's pool updates": refresh evidence, draft, scan claims, queue. Fails closed when a linked pool cannot be verified. Persisted audit trail.
- Status flow draft, review, approved (checklist required), ready; any edit returns to draft. Publishing is manual and external.

## Security and privacy

- Owner sign-in reuses the QLi Agent v2 wallet-signed message session (not a transaction). All owner queries are scoped server-side by the session's wallet + network.
- Tables `qli_creator_*` revoke `anon`/`authenticated`; only server code with the service role reads them, after `requireSession`. Cross-wallet access is impossible through the Data API.
- Quotas by trigger (10 personas, 200 packs, 500 workflows, 300 Q&A per wallet/network) plus a per-wallet action throttle.
- Inputs reject URLs, key/seed/token shapes, emails and impersonation phrases; markup is stripped. No outbound fetch of user-supplied URLs.
- Tour mode (signed out) keeps drafts in tab memory only.

## Not implemented / gated

- Hosted image, text or video generation (Hugging Face, including Hermes models) is not wired to Creator Studio. It would need `HF_TOKEN`, `HF_MODEL_ALLOWLIST`, router discovery, owner consent and atomic reservations through the existing Neural Engine path.
- MP4 rendering, social posting, DMs, engagement metrics: not available.
- No wallet signing, token creation, fee claims, buybacks or burns from this route.