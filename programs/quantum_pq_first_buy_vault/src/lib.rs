//! Quantum QLi Mode B — WOTS/Merkle-authorized classic SPL first-buy vault.
//! NOT AUDITED. NOT DEPLOYED. DEVNET ONLY. Placeholder program id until owner `anchor keys sync`.
//!
//! Separate from the ed25519 `quantum_vault` program. The ONLY release path is `withdraw`, which
//! reassembles the staged 2,404-byte proof on-chain, verifies WOTS + Merkle against the vault's
//! immutable root over the fully bound intent (program, vault, mint, escrow, destination, genesis,
//! amount, nonce, expiry, leaf, epoch), marks the leaf in the vault's bitmap and performs one
//! `transfer_checked` signed by the vault PDA — all in one atomic instruction. A signer of the
//! creator wallet alone can never move escrowed tokens. There is no admin, rescue, reset, policy
//! update or arbitrary CPI; the only CPI target is the classic SPL Token program.
//!
//! Genesis: programs cannot read the cluster genesis hash. Each build freezes exactly one constant
//! (`policy::CLUSTER_GENESIS`: Devnet by default, Mainnet-beta with `--features mainnet`), stamps it
//! at vault creation and binds it into every intent. There is no runtime genesis parameter. Clients
//! must verify `getGenesisHash` off-chain against the owner-attested deployment record per cluster.
//!
//! Launch binding: `create_vault` does NOT create the escrow. It runs as the LAST instruction of
//! the same transaction as DBC `createPoolWithFirstBuy` (receiver = vault PDA), requires the
//! escrow ATA to already exist with the vault PDA as authority, and requires its balance to be at
//! least `min_escrow` (the reviewed minimum output), so pool, buy and vault land or fail together.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use quantum_pq_vault as policy;

// One program id per compilation, selected by the same feature that freezes the genesis, so a
// Devnet build can never carry the Mainnet id (or vice versa). Change ONLY via
// `bun scripts/sync-pq-vault-program-id.ts --network <devnet|mainnet-beta> --program-id <PUBKEY>`.
// Devnet: local-build placeholder (no keypair kept). Mainnet: UNSET sentinel with no private key —
// deploy tooling refuses it, so nothing can be deployed until the owner supplies a public id.
#[cfg(not(feature = "mainnet"))]
declare_id!("9EqcFT8B8NTkTZCXRFTEZxr7zUz3zXHrWgGZYJvViJ4T"); // qli:program-id:devnet
#[cfg(feature = "mainnet")]
declare_id!("6P39VXXxxRHoCX7eJCKC5Tkaf4SUxdJDAeJvzykA8q7Z"); // qli:program-id:mainnet-beta

pub const VAULT_SEED: &[u8] = b"qli-pq-vault";
pub const SESSION_SEED: &[u8] = b"qli-pq-session";
pub const VERSION: u8 = 1;

/// Exact byte range of each chunk inside the 2,404-byte proof (900, 900, 604).
pub fn chunk_range(index: u8) -> Option<(usize, usize)> {
    let i = index as usize;
    if i >= policy::CHUNKS {
        return None;
    }
    let start = i * policy::MAX_CHUNK;
    Some((start, core::cmp::min(start + policy::MAX_CHUNK, policy::PROOF_BYTES)))
}

/// F-03 on-chain leaf reservation. A leaf is burned in the vault bitmap when its session OPENS,
/// i.e. before any proof byte (the WOTS signature) is revealed by `append_chunk`. A leaf can
/// therefore be revealed at most once, whatever any client journal, backup or device believes, and
/// it is never released (an expired or abandoned session keeps its leaf burned).
pub fn reserve_leaf(consumed: &[u8; 32], leaf: u32) -> core::result::Result<[u8; 32], PqVaultError> {
    if leaf == 0 || leaf >= policy::LEAVES {
        return Err(PqVaultError::LeafUnavailable);
    }
    let (i, b) = ((leaf / 8) as usize, 1u8 << (leaf % 8));
    if consumed[i] & b != 0 {
        return Err(PqVaultError::LeafUnavailable);
    }
    let mut out = *consumed;
    out[i] |= b;
    Ok(out)
}

/// Bitmap handed to the policy verifier at `withdraw`: the session's own reserved leaf must be set
/// on chain (reserved at open) and is cleared only in this in-memory view so the shared policy can
/// re-check and re-mark it. Any other leaf state is passed through unchanged.
pub fn withdraw_view(consumed: &[u8; 32], session_leaf: u32, leaf: u32) -> core::result::Result<[u8; 32], PqVaultError> {
    if leaf != session_leaf || leaf == 0 || leaf >= policy::LEAVES {
        return Err(PqVaultError::LeafMismatch);
    }
    let (i, b) = ((leaf / 8) as usize, 1u8 << (leaf % 8));
    if consumed[i] & b == 0 {
        return Err(PqVaultError::LeafMismatch);
    }
    let mut out = *consumed;
    out[i] &= !b;
    Ok(out)
}

/// The first chunk starts with the proof's little-endian leaf index; it must equal the reserved leaf.
pub fn chunk_leaf_ok(index: u8, bytes: &[u8], session_leaf: u32) -> bool {
    index != 0 || (bytes.len() >= 4 && u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) == session_leaf)
}

fn perr(e: policy::PqError) -> Error {
    msg!("policy rejected: {:?}", e);
    ProgramError::Custom(6100 + e as u32).into()
}

#[program]
pub mod quantum_pq_first_buy_vault {
    use super::*;

    /// Create the vault PDA and its escrow ATA. Root and public seed are immutable afterwards.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        root: [u8; 32],
        public_seed: [u8; 32],
        destination_owner: Pubkey,
        min_escrow: u64,
    ) -> Result<()> {
        require!(root != [0u8; 32] && public_seed != [0u8; 32], PqVaultError::BadKey);
        require!(min_escrow > 0, PqVaultError::EscrowBelowMinimum);
        // A freeze authority could freeze the escrow and lock custody outside WOTS control.
        require!(ctx.accounts.mint.freeze_authority.is_none(), PqVaultError::MintFreezable);
        require!(ctx.accounts.escrow.amount >= min_escrow, PqVaultError::EscrowBelowMinimum);
        require!(destination_owner != ctx.accounts.vault.key(), PqVaultError::NonCanonicalDestination);
        let mint = ctx.accounts.mint.key();
        let dest_key = get_associated_token_address(&destination_owner, &mint);
        let pv = policy::Vault::create(
            crate::ID.to_bytes(),
            ctx.accounts.vault.key().to_bytes(),
            ctx.accounts.creator.key().to_bytes(),
            root,
            public_seed,
            mint.to_bytes(),
            ctx.accounts.escrow.key().to_bytes(),
            dest_key.to_bytes(),
            destination_owner.to_bytes(),
            policy::CLUSTER_GENESIS,
            &policy::CLUSTER_GENESIS,
        )
        .map_err(perr)?;
        let v = &mut ctx.accounts.vault;
        v.version = VERSION;
        v.bump = ctx.bumps.vault;
        v.creator = ctx.accounts.creator.key();
        v.mint = mint;
        v.decimals = ctx.accounts.mint.decimals;
        v.escrow = ctx.accounts.escrow.key();
        v.destination = dest_key;
        v.destination_owner = destination_owner;
        v.root = root;
        v.public_seed = public_seed;
        v.genesis = policy::CLUSTER_GENESIS;
        v.last_nonce = 0;
        v.epoch = 0;
        v.consumed = pv.consumed; // possession leaf burned at creation
        Ok(())
    }

    /// Open a staging session. The PDA includes payer and nonce, so `init` refuses overwrites.
    /// Opens a staging session AND burns `leaf` in the vault bitmap (F-03). Only the vault creator
    /// may open (leaf burning is a liveness lever; custody still requires the WOTS proof).
    pub fn open_session(ctx: Context<OpenSession>, nonce: u64, commitment: [u8; 32], ttl: i64, leaf: u32) -> Result<()> {
        require!(ttl > 0 && ttl <= policy::MAX_TTL, PqVaultError::BadTtl);
        require!(nonce > ctx.accounts.vault.last_nonce, PqVaultError::StaleNonce);
        require_keys_eq!(ctx.accounts.payer.key(), ctx.accounts.vault.creator, PqVaultError::NotCreator);
        let reserved = reserve_leaf(&ctx.accounts.vault.consumed, leaf)?;
        ctx.accounts.vault.consumed = reserved;
        let s = &mut ctx.accounts.session;
        s.version = VERSION;
        s.payer = ctx.accounts.payer.key();
        s.vault = ctx.accounts.vault.key();
        s.nonce = nonce;
        s.commitment = commitment;
        s.expires_at = Clock::get()?.unix_timestamp.checked_add(ttl).ok_or(PqVaultError::BadTtl)?;
        s.written = 0;
        s.leaf = leaf;
        s.proof = vec![0u8; policy::PROOF_BYTES];
        Ok(())
    }

    /// Write one chunk at its fixed offset. Only the session payer; each chunk exactly once.
    pub fn append_chunk(ctx: Context<AppendChunk>, index: u8, bytes: Vec<u8>) -> Result<()> {
        let s = &mut ctx.accounts.session;
        require!(Clock::get()?.unix_timestamp <= s.expires_at, PqVaultError::Expired);
        let (a, b) = chunk_range(index).ok_or(PqVaultError::ChunkIndex)?;
        require!(bytes.len() == b - a, PqVaultError::ChunkLength);
        require!(s.written & (1 << index) == 0, PqVaultError::ChunkDuplicate);
        require!(chunk_leaf_ok(index, &bytes, s.leaf), PqVaultError::LeafMismatch);
        s.proof[a..b].copy_from_slice(&bytes);
        s.written |= 1 << index;
        Ok(())
    }

    /// Verify the reassembled proof on-chain and release exactly `amount` to the fixed destination.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64, expires_at: i64, leaf: u32, epoch: u32) -> Result<()> {
        let s = &ctx.accounts.session;
        require!(s.written == 0b111, PqVaultError::MissingChunks);
        let v = &ctx.accounts.vault;
        let mut pv = policy::Vault {
            program: crate::ID.to_bytes(),
            address: v.key().to_bytes(),
            creator: v.creator.to_bytes(),
            root: v.root,
            seed: v.public_seed,
            mint: v.mint.to_bytes(),
            escrow: v.escrow.to_bytes(),
            destination: v.destination.to_bytes(),
            destination_owner: v.destination_owner.to_bytes(),
            genesis: v.genesis,
            last_nonce: v.last_nonce,
            epoch: v.epoch,
            consumed: withdraw_view(&v.consumed, s.leaf, leaf)?,
        };
        let mut ps = policy::Session {
            payer: s.payer.to_bytes(),
            vault: s.vault.to_bytes(),
            commitment: s.commitment,
            expires_at: s.expires_at,
            rent_lamports: 0,
            chunks: [0u8, 1, 2].map(|i| {
                let (a, b) = chunk_range(i).unwrap();
                Some(s.proof[a..b].to_vec())
            }),
            state: policy::SessionState::Open,
        };
        let intent = policy::Intent {
            program: crate::ID.to_bytes(),
            vault: pv.address,
            mint: pv.mint,
            escrow: pv.escrow,
            destination: pv.destination,
            amount,
            genesis: v.genesis,
            nonce: s.nonce,
            expires_at,
            leaf,
            epoch,
        };
        let esc = &ctx.accounts.escrow;
        let dst = &ctx.accounts.destination;
        let facts = policy::ChainFacts {
            genesis: v.genesis,
            now: Clock::get()?.unix_timestamp,
            escrow_owner: esc.owner.to_bytes(),
            escrow_mint: esc.mint.to_bytes(),
            escrow_amount: esc.amount,
            destination_mint: dst.mint.to_bytes(),
            destination_owner: dst.owner.to_bytes(),
        };
        let mut hashes = 0u32;
        let plan = ps
            .withdraw(&ctx.accounts.payer.key().to_bytes(), &mut pv, &intent, &facts, &mut hashes)
            .map_err(perr)?;
        // Persist replay state before the CPI; any later failure reverts the whole instruction.
        let vm = &mut ctx.accounts.vault;
        vm.consumed = pv.consumed;
        vm.last_nonce = pv.last_nonce;
        let mint_key = vm.mint;
        let creator_key = vm.creator;
        let bump = [vm.bump];
        let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), creator_key.as_ref(), &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            plan.amount,
            ctx.accounts.mint.decimals,
        )?;
        Ok(())
    }

    /// Close an expired, unused session; rent returns only to its payer.
    pub fn close_session(ctx: Context<CloseSession>) -> Result<()> {
        require!(Clock::get()?.unix_timestamp > ctx.accounts.session.expires_at, PqVaultError::SessionOpen);
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct PqVault {
    pub version: u8,
    pub bump: u8,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub decimals: u8,
    pub escrow: Pubkey,
    pub destination: Pubkey,
    pub destination_owner: Pubkey,
    pub root: [u8; 32],
    pub public_seed: [u8; 32],
    pub genesis: [u8; 32],
    pub last_nonce: u64,
    pub epoch: u32,
    pub consumed: [u8; 32],
}

#[account]
pub struct PqSession {
    pub version: u8,
    pub payer: Pubkey,
    pub vault: Pubkey,
    pub nonce: u64,
    pub commitment: [u8; 32],
    pub expires_at: i64,
    pub written: u8,
    /// Leaf burned on chain when this session opened (F-03).
    pub leaf: u32,
    pub proof: Vec<u8>,
}
impl PqSession {
    pub const SPACE: usize = 8 + 1 + 32 + 32 + 8 + 32 + 8 + 1 + 4 + 4 + policy::PROOF_BYTES;
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init, payer = creator, space = 8 + PqVault::INIT_SPACE,
        seeds = [VAULT_SEED, mint.key().as_ref(), creator.key().as_ref()], bump
    )]
    pub vault: Account<'info, PqVault>,
    /// Must already exist (created by the DBC first buy earlier in the same transaction).
    #[account(
        associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub escrow: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct OpenSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.mint.as_ref(), vault.creator.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, PqVault>,
    #[account(
        init, payer = payer, space = PqSession::SPACE,
        seeds = [SESSION_SEED, vault.key().as_ref(), payer.key().as_ref(), &nonce.to_le_bytes()], bump
    )]
    pub session: Account<'info, PqSession>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppendChunk<'info> {
    pub payer: Signer<'info>,
    #[account(mut, has_one = payer @ PqVaultError::WrongPayer)]
    pub session: Account<'info, PqSession>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.mint.as_ref(), vault.creator.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, PqVault>,
    #[account(mut, close = payer, has_one = payer @ PqVaultError::WrongPayer, has_one = vault @ PqVaultError::WrongVault)]
    pub session: Account<'info, PqSession>,
    #[account(address = vault.mint @ PqVaultError::WrongMint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, address = vault.escrow @ PqVaultError::WrongEscrow, token::mint = mint, token::authority = vault)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(
        mut, address = vault.destination @ PqVaultError::NonCanonicalDestination,
        token::mint = mint, token::authority = vault.destination_owner
    )]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseSession<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, close = payer, has_one = payer @ PqVaultError::WrongPayer)]
    pub session: Account<'info, PqSession>,
}

#[error_code]
pub enum PqVaultError {
    BadKey,
    BadTtl,
    StaleNonce,
    Expired,
    ChunkIndex,
    ChunkLength,
    ChunkDuplicate,
    MissingChunks,
    SessionOpen,
    WrongPayer,
    WrongVault,
    WrongMint,
    WrongEscrow,
    NonCanonicalDestination,
    EscrowBelowMinimum,
    /// Appended last so earlier error codes stay stable.
    MintFreezable,
    /// F-03 (appended): leaf is 0, out of range, or already burned/reserved on chain.
    LeafUnavailable,
    /// F-03: proof/withdraw leaf differs from the leaf reserved when the session opened.
    LeafMismatch,
    /// F-03: only the vault creator may open a leaf-reserving session.
    NotCreator,
}

#[cfg(test)]
mod f03_tests {
    use super::*;
    #[test]
    fn reserve_burns_once_and_never_releases() {
        let z = [0u8; 32];
        let a = reserve_leaf(&z, 5).unwrap();
        assert_eq!(a[0], 1 << 5);
        assert!(matches!(reserve_leaf(&a, 5), Err(PqVaultError::LeafUnavailable)));
        assert!(matches!(reserve_leaf(&z, 0), Err(PqVaultError::LeafUnavailable)));
        assert!(matches!(reserve_leaf(&z, policy::LEAVES), Err(PqVaultError::LeafUnavailable)));
        // A second device restoring an old journal picks leaf 5 again: refused on chain.
        let b = reserve_leaf(&a, 6).unwrap();
        assert_eq!(b[0], (1 << 5) | (1 << 6));
    }
    #[test]
    fn withdraw_view_requires_the_sessions_reserved_leaf() {
        let a = reserve_leaf(&[0u8; 32], 9).unwrap();
        let v = withdraw_view(&a, 9, 9).unwrap();
        assert_eq!(v, [0u8; 32]);
        assert!(matches!(withdraw_view(&a, 9, 10), Err(PqVaultError::LeafMismatch)));
        assert!(matches!(withdraw_view(&[0u8; 32], 9, 9), Err(PqVaultError::LeafMismatch)));
        assert!(matches!(withdraw_view(&a, 0, 0), Err(PqVaultError::LeafMismatch)));
        // Other burned leaves stay burned in the view (policy still sees them as consumed).
        let c = reserve_leaf(&a, 3).unwrap();
        assert_eq!(withdraw_view(&c, 9, 9).unwrap()[0], 1 << 3);
    }
    #[test]
    fn first_chunk_must_carry_the_reserved_leaf() {
        assert!(chunk_leaf_ok(0, &7u32.to_le_bytes(), 7));
        assert!(!chunk_leaf_ok(0, &8u32.to_le_bytes(), 7));
        assert!(!chunk_leaf_ok(0, &[9u8; 2], 7));
        assert!(chunk_leaf_ok(1, &[], 7));
    }
}