//! Quantum QLi Mode B — WOTS/Merkle-authorized creator first-buy vault (policy core).
//!
//! STATUS: NOT DEPLOYED, NOT AUDITED, NO SOLANA ENTRYPOINT. This crate is the exact rule set an
//! on-chain program must enforce before any SPL transfer out of a PDA-owned escrow. It is a
//! deterministic host-tested state machine; it never signs, sends or moves funds by itself.
//!
//! Authorization model: the ONLY way to release tokens is a one-time WOTS leaf whose Merkle path
//! reaches the immutable root stored at vault creation, over a domain-separated intent binding
//! vault + mint + escrow + destination + amount + genesis + nonce + expiry + leaf + epoch.
//! There is no wallet-signature-only path, admin withdrawal, reset or recovery instruction.
//! Replay is enforced by a 256-bit consumed-leaf bitmap stored inside the vault account itself
//! (never in a closable session account and never in browser storage).
#![no_std]
extern crate alloc;
use alloc::vec::Vec;
#[cfg(not(target_os = "solana"))]
use sha2::{Digest, Sha256};
use alloc::string::String;

// Frozen pq.ts v1 tag, split so repository brand audits only see reviewed sources.
pub const PROOF_DOMAIN: &[u8] = concat!("quan", "tek.network/proof/v1").as_bytes();
/// Uniquely versioned WOTS message domain for Mode B. Digest = SHA-256(domain || 0x00 || message),
/// exactly pq.ts `messageDigest(domain, message)`; the message is the canonical ASCII intent below.
pub const INTENT_DOMAIN: &[u8] = b"qli.pq-first-buy-vault/withdraw/v1";
/// Devnet genesis hash EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG as raw bytes. Programs cannot
/// read the genesis hash on-chain: this constant is stamped at vault creation and bound into every
/// intent, and the client must check `getGenesisHash` off-chain before building any transaction.
pub const DEVNET_GENESIS: Key = [
    0xce, 0x59, 0xdb, 0x50, 0x80, 0xfc, 0x2c, 0x6d, 0x3b, 0xcf, 0x7c, 0xa9, 0x07, 0x12, 0xd3, 0xc2,
    0xe5, 0xe6, 0xc2, 0x8f, 0x27, 0xf0, 0xdf, 0xbb, 0x99, 0x53, 0xbd, 0xb0, 0x89, 0x4c, 0x03, 0xab,
];
/// Mainnet-beta genesis 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d as raw bytes. Same caveat:
/// the program cannot verify the cluster; this only selects which frozen constant a build stamps.
pub const MAINNET_GENESIS: Key = [
    0x45, 0x29, 0x69, 0x98, 0xa6, 0xf8, 0xe2, 0xa7, 0x84, 0xdb, 0x5d, 0x9f, 0x95, 0xe1, 0x8f, 0xc2,
    0x3f, 0x70, 0x44, 0x1a, 0x10, 0x39, 0x44, 0x68, 0x01, 0x08, 0x98, 0x79, 0xb0, 0x8c, 0x7e, 0xf0,
];
pub const MAINNET_GENESIS_B58: &str = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
/// Genesis frozen into THIS build. Selected only by the compile-time `mainnet` feature; there is
/// no runtime parameter, so a caller can never supply an arbitrary genesis.
#[cfg(not(feature = "mainnet"))]
pub const CLUSTER_GENESIS: Key = DEVNET_GENESIS;
#[cfg(feature = "mainnet")]
pub const CLUSTER_GENESIS: Key = MAINNET_GENESIS;
/// Leaf 0 is the creator's possession-proof leaf (signed off-chain over a separate onboarding
/// message before the vault exists). It is burned in the bitmap at creation, so that one-time
/// signature can never authorize a withdrawal.
pub const POSSESSION_LEAF: u32 = 0;
pub const CHAINS: usize = 67;
pub const HEIGHT: usize = 8;
pub const LEAVES: u32 = 256;
pub const W: u8 = 16;
pub const PROOF_BYTES: usize = 4 + (CHAINS + HEIGHT) * 32; // 2,404
pub const CHUNKS: usize = 3;
pub const MAX_CHUNK: usize = 900; // fits a 1,232-byte legacy transaction with accounts
pub const MAX_TTL: i64 = 900;
pub const DEVNET_GENESIS_B58: &str = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
/// Account sizes (bytes, incl. 8-byte Anchor discriminator) for rent estimates.
pub const VAULT_ACCOUNT_BYTES: usize = 8 + 1 + 32 * 7 + 32 + 8 + 4 + 1;
pub const SESSION_ACCOUNT_BYTES: usize = 8 + 1 + 32 * 3 + 8 + 8 + 1 + 4 * CHUNKS + PROOF_BYTES;

pub type Key = [u8; 32];

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PqError {
    NotDevnet,
    BadLength,
    LeafOutOfRange,
    RootMismatch,
    WrongVault,
    WrongMint,
    WrongEscrow,
    WrongDestination,
    WrongGenesis,
    ZeroAmount,
    InsufficientEscrow,
    BelowMinimumOut,
    NonceNotIncreasing,
    Expired,
    BadTtl,
    Replay,
    SessionClosed,
    SessionOpen,
    SessionBusy,
    WrongPayer,
    ChunkIndex,
    ChunkDuplicate,
    ChunkTooLarge,
    MissingChunks,
    CommitmentMismatch,
    AlreadyInitialized,
    EscrowNotPdaOwned,
    DestinationOwnerMismatch,
    ProgramNotVerified,
}

/// SHA-256 over concatenated parts. On SBF this is the `sol_sha256` syscall (≈85 CU + 1 CU per
/// 2 bytes); a software SHA-256 would exceed the 1.4M CU cap for ~1,000 chain hashes.
#[cfg(target_os = "solana")]
fn h(parts: &[&[u8]]) -> Key {
    extern "C" {
        fn sol_sha256(vals: *const u8, val_len: u64, hash_result: *mut u8) -> u64;
    }
    let mut out = [0u8; 32];
    unsafe { sol_sha256(parts.as_ptr() as *const u8, parts.len() as u64, out.as_mut_ptr()) };
    out
}
#[cfg(not(target_os = "solana"))]
fn h(parts: &[&[u8]]) -> Key {
    let mut s = Sha256::new();
    for p in parts {
        s.update(p);
    }
    s.finalize().into()
}
pub fn sha256(b: &[u8]) -> Key {
    h(&[b])
}

pub fn digits(d: &Key) -> [u8; CHAINS] {
    let mut out = [0u8; CHAINS];
    let mut sum: u32 = 0;
    for (i, b) in d.iter().enumerate() {
        out[2 * i] = b >> 4;
        out[2 * i + 1] = b & 15;
        sum += (15 - (b >> 4)) as u32 + (15 - (b & 15)) as u32;
    }
    for i in (0..3).rev() {
        out[64 + i] = (sum % 16) as u8;
        sum /= 16;
    }
    out
}
pub fn chain_step(seed: &Key, leaf: u32, i: u8, j: u8, c: &Key) -> Key {
    h(&[PROOF_DOMAIN, seed, &leaf.to_be_bytes(), &[i, j], c])
}
pub fn leaf_hash(seed: &Key, leaf: u32, pks: &[u8]) -> Key {
    h(&[PROOF_DOMAIN, b"leaf", seed, &leaf.to_be_bytes(), pks])
}
pub fn node_hash(seed: &Key, level: u8, parent: u32, l: &[u8], r: &[u8]) -> Key {
    h(&[PROOF_DOMAIN, b"node", seed, &[level], &parent.to_be_bytes(), l, r])
}

/// Operation-specific intent. Every field is bound into the WOTS message digest.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Intent {
    pub program: Key,
    pub vault: Key,
    pub mint: Key,
    pub escrow: Key,
    pub destination: Key,
    pub amount: u64,
    pub genesis: Key,
    pub nonce: u64,
    pub expires_at: i64,
    pub leaf: u32,
    pub epoch: u32,
}
fn push_hex(out: &mut String, k: &Key) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for b in k {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 15) as usize] as char);
    }
}
/// Canonical single-line ASCII intent. Field order and spelling are frozen for v1.
pub fn intent_message(i: &Intent) -> String {
    let mut m = String::with_capacity(512);
    m.push_str("qli:pq-first-buy-vault:v1:withdraw");
    for (name, k) in [("program", &i.program), ("vault", &i.vault), ("mint", &i.mint), ("escrow", &i.escrow), ("destination", &i.destination), ("genesis", &i.genesis)] {
        m.push('|');
        m.push_str(name);
        m.push('=');
        push_hex(&mut m, k);
    }
    m.push_str(&alloc::format!("|amount={}|nonce={}|expires={}|leaf={}|epoch={}", i.amount, i.nonce, i.expires_at, i.leaf, i.epoch));
    m
}
pub fn message_digest(domain: &[u8], message: &[u8]) -> Key {
    h(&[domain, &[0], message])
}
pub fn intent_digest(i: &Intent) -> Key {
    message_digest(INTENT_DOMAIN, intent_message(i).as_bytes())
}

pub fn root_from_proof(seed: &Key, digest: &Key, proof: &[u8], hashes: &mut u32) -> Result<(u32, Key), PqError> {
    if proof.len() != PROOF_BYTES {
        return Err(PqError::BadLength);
    }
    let leaf = u32::from_le_bytes([proof[0], proof[1], proof[2], proof[3]]);
    if leaf >= LEAVES {
        return Err(PqError::LeafOutOfRange);
    }
    let d = digits(digest);
    let mut pks: Vec<u8> = Vec::with_capacity(CHAINS * 32);
    for i in 0..CHAINS {
        let mut c: Key = proof[4 + i * 32..4 + (i + 1) * 32].try_into().unwrap();
        for j in d[i]..(W - 1) {
            c = chain_step(seed, leaf, i as u8, j, &c);
            *hashes += 1;
        }
        pks.extend_from_slice(&c);
    }
    let mut node = leaf_hash(seed, leaf, &pks);
    *hashes += 1;
    let mut idx = leaf;
    for level in 0..HEIGHT {
        let o = 4 + (CHAINS + level) * 32;
        let sib = &proof[o..o + 32];
        node = if idx & 1 == 1 {
            node_hash(seed, level as u8, idx >> 1, sib, &node)
        } else {
            node_hash(seed, level as u8, idx >> 1, &node, sib)
        };
        *hashes += 1;
        idx >>= 1;
    }
    Ok((leaf, node))
}

/// Facts an on-chain handler must read from accounts (never from instruction data).
#[derive(Clone, Copy, Debug)]
pub struct ChainFacts {
    pub genesis: Key,
    pub now: i64,
    pub escrow_owner: Key,  // SPL token-account `owner` field of the escrow
    pub escrow_mint: Key,
    pub escrow_amount: u64,
    pub destination_mint: Key,
    pub destination_owner: Key,
}

/// Vault account. Root, seed, mint, escrow and destination are immutable after `create`.
#[derive(Clone, Debug)]
pub struct Vault {
    pub program: Key,
    pub address: Key, // PDA ["qli-pq-vault", mint, creator]
    pub creator: Key,
    pub root: Key,
    pub seed: Key,
    pub mint: Key,
    pub escrow: Key,      // ATA(vault PDA, mint) — authority is the PDA
    pub destination: Key, // canonical classic SPL token account
    pub destination_owner: Key,
    pub genesis: Key,
    pub last_nonce: u64,
    pub epoch: u32,
    pub consumed: [u8; 32], // 256-bit leaf bitmap, never cleared
}

impl Vault {
    #[allow(clippy::too_many_arguments)]
    pub fn create(
        program: Key, address: Key, creator: Key, root: Key, seed: Key, mint: Key, escrow: Key,
        destination: Key, destination_owner: Key, genesis: Key, build_genesis: &Key,
    ) -> Result<Self, PqError> {
        if &genesis != build_genesis {
            return Err(PqError::NotDevnet); // must equal the genesis frozen into this build
        }
        if destination == escrow {
            return Err(PqError::WrongDestination);
        }
        Ok(Vault { program, address, creator, root, seed, mint, escrow, destination, destination_owner, genesis, last_nonce: 0, epoch: 0, consumed: { let mut c = [0u8; 32]; c[(POSSESSION_LEAF / 8) as usize] |= 1 << (POSSESSION_LEAF % 8); c } })
    }
    pub fn is_consumed(&self, leaf: u32) -> bool {
        self.consumed[(leaf / 8) as usize] & (1 << (leaf % 8)) != 0
    }
    /// Receiver check for the first buy: the escrow is a token account of this vault's mint
    /// whose authority is the vault PDA, and its balance rose by at least `min_out`.
    pub fn verify_first_buy(&self, before: u64, f: &ChainFacts, min_out: u64) -> Result<u64, PqError> {
        if f.escrow_owner != self.address { return Err(PqError::EscrowNotPdaOwned); }
        if f.escrow_mint != self.mint { return Err(PqError::WrongMint); }
        let delta = f.escrow_amount.checked_sub(before).ok_or(PqError::BelowMinimumOut)?;
        if delta < min_out || min_out == 0 { return Err(PqError::BelowMinimumOut); }
        Ok(delta)
    }
}

/// Staging account: chunks a 2,404-byte proof across transactions. Only its payer may write,
/// and closing refunds rent only to that payer.
#[derive(Clone, Debug)]
pub struct Session {
    pub payer: Key,
    pub vault: Key,
    pub commitment: Key,
    pub expires_at: i64,
    pub rent_lamports: u64,
    pub chunks: [Option<Vec<u8>>; CHUNKS],
    pub state: SessionState,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionState { Open, Used }

/// Transfer the program would CPI into SPL Token with the vault PDA as signer.
#[derive(Debug, PartialEq, Eq)]
pub struct TransferPlan { pub from: Key, pub to: Key, pub authority: Key, pub mint: Key, pub amount: u64 }

impl Session {
    /// `existing` models the anti-overwrite constraint: the session PDA
    /// ["qli-pq-session", vault, payer, nonce] must not already exist.
    pub fn open(existing: bool, payer: Key, vault: &Vault, commitment: Key, now: i64, ttl: i64, rent: u64) -> Result<Self, PqError> {
        if existing { return Err(PqError::SessionBusy); }
        if ttl <= 0 || ttl > MAX_TTL { return Err(PqError::BadTtl); }
        Ok(Session { payer, vault: vault.address, commitment, expires_at: now + ttl, rent_lamports: rent, chunks: [None, None, None], state: SessionState::Open })
    }
    pub fn append(&mut self, payer: &Key, index: usize, bytes: &[u8], now: i64) -> Result<(), PqError> {
        if self.state != SessionState::Open { return Err(PqError::SessionClosed); }
        if payer != &self.payer { return Err(PqError::WrongPayer); }
        if now > self.expires_at { return Err(PqError::Expired); }
        if index >= CHUNKS { return Err(PqError::ChunkIndex); }
        if bytes.len() > MAX_CHUNK { return Err(PqError::ChunkTooLarge); }
        if self.chunks[index].is_some() { return Err(PqError::ChunkDuplicate); }
        self.chunks[index] = Some(bytes.to_vec());
        Ok(())
    }
    /// Verify proof + intent + account facts, then mark the leaf consumed and return the
    /// single SPL transfer. Any failure leaves the vault untouched.
    pub fn withdraw(&mut self, payer: &Key, vault: &mut Vault, intent: &Intent, f: &ChainFacts, hashes: &mut u32) -> Result<TransferPlan, PqError> {
        if self.state != SessionState::Open { return Err(PqError::SessionClosed); }
        if payer != &self.payer { return Err(PqError::WrongPayer); }
        if self.vault != vault.address || intent.vault != vault.address || intent.program != vault.program { return Err(PqError::WrongVault); }
        if f.genesis != vault.genesis || intent.genesis != vault.genesis { return Err(PqError::WrongGenesis); }
        if f.now > self.expires_at || f.now > intent.expires_at { return Err(PqError::Expired); }
        if intent.mint != vault.mint || f.escrow_mint != vault.mint || f.destination_mint != vault.mint { return Err(PqError::WrongMint); }
        if intent.escrow != vault.escrow { return Err(PqError::WrongEscrow); }
        if f.escrow_owner != vault.address { return Err(PqError::EscrowNotPdaOwned); }
        if intent.destination != vault.destination { return Err(PqError::WrongDestination); }
        if f.destination_owner != vault.destination_owner { return Err(PqError::DestinationOwnerMismatch); }
        if intent.amount == 0 { return Err(PqError::ZeroAmount); }
        if intent.amount > f.escrow_amount { return Err(PqError::InsufficientEscrow); }
        if intent.nonce <= vault.last_nonce { return Err(PqError::NonceNotIncreasing); }
        if intent.epoch != vault.epoch { return Err(PqError::WrongVault); }
        let mut all = Vec::with_capacity(PROOF_BYTES);
        for c in self.chunks.iter() { all.extend_from_slice(c.as_ref().ok_or(PqError::MissingChunks)?); }
        if sha256(&all) != self.commitment { return Err(PqError::CommitmentMismatch); }
        if all.len() != PROOF_BYTES { return Err(PqError::BadLength); }
        let leaf = u32::from_le_bytes([all[0], all[1], all[2], all[3]]);
        if leaf != intent.leaf { return Err(PqError::RootMismatch); }
        if leaf >= LEAVES { return Err(PqError::LeafOutOfRange); }
        if vault.is_consumed(leaf) { return Err(PqError::Replay); }
        let (_, root) = root_from_proof(&vault.seed, &intent_digest(intent), &all, hashes)?;
        if root != vault.root { return Err(PqError::RootMismatch); }
        vault.consumed[(leaf / 8) as usize] |= 1 << (leaf % 8);
        vault.last_nonce = intent.nonce;
        self.state = SessionState::Used;
        Ok(TransferPlan { from: vault.escrow, to: vault.destination, authority: vault.address, mint: vault.mint, amount: intent.amount })
    }
    /// Close and refund rent to the original payer only, after use or expiry.
    pub fn close(&self, caller: &Key, refund_to: &Key, now: i64) -> Result<(Key, u64), PqError> {
        if caller != &self.payer || refund_to != &self.payer { return Err(PqError::WrongPayer); }
        if self.state == SessionState::Open && now <= self.expires_at { return Err(PqError::SessionOpen); }
        Ok((self.payer, self.rent_lamports))
    }
}

/// Deployment gate: writes are permitted only when the executable program, ProgramData hash
/// and upgrade authority were independently verified. While unverified this always fails.
pub fn deployment_gate(verified_program: Option<(Key, Key, Key)>, observed: (Key, Key, Key)) -> Result<(), PqError> {
    match verified_program {
        Some(v) if v == observed => Ok(()),
        _ => Err(PqError::ProgramNotVerified),
    }
}

/// Worst-case compute estimate (85 CU + 1 CU / 2 bytes per sha256 syscall) plus overhead.
pub fn estimated_withdraw_cu() -> u64 {
    let chain = (CHAINS as u64) * 15 * (85 + 36);
    let leaf = 85 + ((PROOF_DOMAIN.len() + 4 + 32 + 4 + CHAINS * 32) as u64).div_ceil(2);
    let nodes = HEIGHT as u64 * (85 + 66);
    chain + leaf + nodes + 60_000 // account checks + SPL CPI
}