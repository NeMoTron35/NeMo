//! EXPERIMENTAL Quantum Identity 2.0 verifier core (no_std-friendly, pure Rust).
//! Byte-compatible with src/lib/qli-core/pq.ts (frozen v1 encoding). NOT deployed, NOT audited.
//! A valid proof is NOT authorization for Quantum Vault or any fund movement.
#![no_std]
extern crate alloc;
use alloc::{string::String, vec::Vec};
use sha2::{Digest, Sha256};

pub const PROOF_DOMAIN: &[u8] = b"quantek.network/proof/v1";
pub const CHAINS: usize = 67;
pub const HEIGHT: usize = 8;
pub const W: u8 = 16;
pub const PROOF_BYTES: usize = 4 + (CHAINS + HEIGHT) * 32;
pub const MAX_CHUNK: usize = 900;
pub const MAX_TTL: i64 = 900;

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    BadLength,
    LeafOutOfRange,
    RootMismatch,
    IntentMismatch,
    Expired,
    WrongGenesis,
    Replay,
    SessionClosed,
    ChunkIndex,
    ChunkDuplicate,
    ChunkTooLarge,
    MissingChunks,
    CommitmentMismatch,
    WrongPayer,
    BadTtl,
}

fn h(parts: &[&[u8]]) -> [u8; 32] {
    let mut s = Sha256::new();
    for p in parts {
        s.update(p);
    }
    s.finalize().into()
}

pub fn message_digest(domain: &[u8], message: &[u8]) -> [u8; 32] {
    h(&[domain, &[0], message])
}

pub fn digits(d: &[u8; 32]) -> [u8; CHAINS] {
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

/// Counts SHA-256 invocations so a host benchmark can estimate compute cost.
pub struct Counter(pub u32);

pub fn root_from_proof(
    seed: &[u8; 32],
    digest: &[u8; 32],
    proof: &[u8],
    ctr: &mut Counter,
) -> Result<[u8; 32], VerifyError> {
    if proof.len() != PROOF_BYTES {
        return Err(VerifyError::BadLength);
    }
    let leaf = u32::from_le_bytes([proof[0], proof[1], proof[2], proof[3]]);
    if leaf >= 256 {
        return Err(VerifyError::LeafOutOfRange);
    }
    let lb = leaf.to_be_bytes();
    let d = digits(digest);
    let mut pks: Vec<u8> = Vec::with_capacity(CHAINS * 32);
    for i in 0..CHAINS {
        let mut c: [u8; 32] = proof[4 + i * 32..4 + (i + 1) * 32].try_into().unwrap();
        for j in d[i]..(W - 1) {
            c = h(&[PROOF_DOMAIN, seed, &lb, &[i as u8, j], &c]);
            ctr.0 += 1;
        }
        pks.extend_from_slice(&c);
    }
    let mut node = h(&[PROOF_DOMAIN, b"leaf", seed, &lb, &pks]);
    ctr.0 += 1;
    let mut idx = leaf;
    for level in 0..HEIGHT {
        let o = 4 + (CHAINS + level) * 32;
        let sib = &proof[o..o + 32];
        let parent = (idx >> 1).to_be_bytes();
        node = if idx & 1 == 1 {
            h(&[PROOF_DOMAIN, b"node", seed, &[level as u8], &parent, sib, &node])
        } else {
            h(&[PROOF_DOMAIN, b"node", seed, &[level as u8], &parent, &node, sib])
        };
        ctr.0 += 1;
        idx >>= 1;
    }
    Ok(node)
}

/// Bound intent. Mirrors identity-v2.ts bindingMessage exactly.
pub struct Intent<'a> {
    pub wallet: &'a str,
    pub target: &'a str,
    pub action: &'a str,
    pub genesis: &'a str,
    pub nonce: &'a str,
    pub expires_at: i64,
}
pub fn binding_message(i: &Intent) -> String {
    alloc::format!(
        "qli:v2-experimental:action\nwallet:{}\ntarget:{}\naction:{}\ngenesis:{}\nnonce:{}\nexpires:{}",
        i.wallet, i.target, i.action, i.genesis, i.nonce, i.expires_at
    )
}

/// Staged verifier state machine (what an on-chain staging account would hold).
pub struct Session {
    pub payer: [u8; 32],
    pub root: [u8; 32],
    pub seed: [u8; 32],
    pub commitment: [u8; 32],
    pub expires_at: i64,
    pub chunks: [Option<Vec<u8>>; 3],
    pub closed: bool,
}

impl Session {
    pub fn open(payer: [u8; 32], root: [u8; 32], seed: [u8; 32], commitment: [u8; 32], now: i64, ttl: i64) -> Result<Self, VerifyError> {
        if ttl <= 0 || ttl > MAX_TTL {
            return Err(VerifyError::BadTtl);
        }
        Ok(Session { payer, root, seed, commitment, expires_at: now + ttl, chunks: [None, None, None], closed: false })
    }
    pub fn append(&mut self, payer: &[u8; 32], index: usize, bytes: &[u8], now: i64) -> Result<(), VerifyError> {
        if self.closed { return Err(VerifyError::SessionClosed); }
        if payer != &self.payer { return Err(VerifyError::WrongPayer); }
        if now > self.expires_at { return Err(VerifyError::Expired); }
        if index >= 3 { return Err(VerifyError::ChunkIndex); }
        if bytes.len() > MAX_CHUNK { return Err(VerifyError::ChunkTooLarge); }
        if self.chunks[index].is_some() { return Err(VerifyError::ChunkDuplicate); }
        self.chunks[index] = Some(bytes.to_vec());
        Ok(())
    }
    /// Verifies commitment, intent binding, genesis, expiry, root and single-use leaf.
    pub fn finalize(
        &mut self,
        payer: &[u8; 32],
        intent: &Intent,
        expected_genesis: &str,
        consumed: &mut Vec<([u8; 32], u32)>,
        now: i64,
        ctr: &mut Counter,
    ) -> Result<u32, VerifyError> {
        if self.closed { return Err(VerifyError::SessionClosed); }
        if payer != &self.payer { return Err(VerifyError::WrongPayer); }
        if now > self.expires_at || now > intent.expires_at { return Err(VerifyError::Expired); }
        if intent.genesis != expected_genesis { return Err(VerifyError::WrongGenesis); }
        let mut all = Vec::with_capacity(PROOF_BYTES);
        for c in self.chunks.iter() {
            all.extend_from_slice(c.as_ref().ok_or(VerifyError::MissingChunks)?);
        }
        if h(&[&all]) != self.commitment { return Err(VerifyError::CommitmentMismatch); }
        let leaf = u32::from_le_bytes([all[0], all[1], all[2], all[3]]);
        if consumed.iter().any(|(r, l)| r == &self.root && *l == leaf) { return Err(VerifyError::Replay); }
        let msg = binding_message(intent);
        let digest = message_digest(PROOF_DOMAIN, msg.as_bytes());
        if root_from_proof(&self.seed, &digest, &all, ctr)? != self.root {
            return Err(VerifyError::RootMismatch);
        }
        consumed.push((self.root, leaf));
        self.closed = true;
        Ok(leaf)
    }
}

pub fn commitment(bytes: &[u8]) -> [u8; 32] {
    h(&[bytes])
}