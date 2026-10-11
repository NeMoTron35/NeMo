//! Quantum Vault Phase 1 — NOT AUDITED, NOT DEPLOYED.
//! Owner-controlled classic SPL Token vault. The vault PDA owns the escrow ATA; every withdrawal
//! is checked on-chain against an immutable policy (fixed destination, per-withdraw maximum,
//! rolling 24h limit, unlock time, intent expiry, sequential nonce, epoch, pause).
//! Authorization is the ordinary ed25519 owner signature. There is no post-quantum verifier,
//! no admin, no rescue path, no policy loosening and no arbitrary CPI target.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use quantum_vault_policy as policy;

// Local-build placeholder; replace via `anchor keys sync` before any deployment.
declare_id!("93v9K8ytGDR3BAoxtaVVo7u1oaBv3Pu257eBAPCp7SH5");

pub const VAULT_SEED: &[u8] = b"qvault";

#[program]
pub mod quantum_vault {
    use super::*;

    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: u64,
        max_per_withdraw: u64,
        daily_limit: u64,
        unlock_ts: i64,
    ) -> Result<()> {
        let destination = ctx.accounts.destination.key();
        let p = policy::Policy {
            destination: destination.to_bytes(),
            max_per_withdraw,
            daily_limit,
            unlock_ts,
        };
        policy::validate_policy(&p).map_err(map_err)?;
        let now = Clock::get()?.unix_timestamp;
        let v = &mut ctx.accounts.vault;
        v.version = policy::ACCOUNT_VERSION;
        v.bump = ctx.bumps.vault;
        v.owner = ctx.accounts.owner.key();
        v.mint = ctx.accounts.mint.key();
        v.vault_id = vault_id;
        v.decimals = ctx.accounts.mint.decimals;
        v.destination = destination;
        v.max_per_withdraw = max_per_withdraw;
        v.daily_limit = daily_limit;
        v.unlock_ts = unlock_ts;
        v.window_start = now;
        v.window_spent = 0;
        v.nonce = 0;
        v.epoch = 0;
        v.paused = false;
        v.unpause_at = 0;
        emit!(VaultCreated {
            vault: v.key(),
            owner: v.owner,
            mint: v.mint,
            vault_id,
            destination
        });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::ZeroAmount);
        let decimals = ctx.accounts.vault.decimals;
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.source.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;
        emit!(Deposited {
            vault: ctx.accounts.vault.key(),
            depositor: ctx.accounts.depositor.key(),
            amount
        });
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        nonce: u64,
        epoch: u32,
        expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let v = &ctx.accounts.vault;
        let p = policy::Policy {
            destination: v.destination.to_bytes(),
            max_per_withdraw: v.max_per_withdraw,
            daily_limit: v.daily_limit,
            unlock_ts: v.unlock_ts,
        };
        let s = state_of(v);
        let intent = policy::Intent {
            amount,
            destination: ctx.accounts.destination.key().to_bytes(),
            nonce,
            epoch,
            expires_at,
        };
        let next = policy::check_withdraw(&p, &s, &intent, ctx.accounts.escrow.amount, now)
            .map_err(map_err)?;

        let owner = v.owner;
        let mint = v.mint;
        let id = v.vault_id.to_le_bytes();
        let bump = [v.bump];
        let seeds: &[&[u8]] = &[VAULT_SEED, owner.as_ref(), mint.as_ref(), &id, &bump];
        let signer = &[seeds];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            amount,
            ctx.accounts.vault.decimals,
        )?;
        let v = &mut ctx.accounts.vault;
        apply(v, &next);
        emit!(Withdrawn {
            vault: v.key(),
            destination: v.destination,
            amount,
            nonce
        });
        Ok(())
    }

    pub fn pause(ctx: Context<OwnerOnly>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        let next = policy::pause(&state_of(v));
        apply(v, &next);
        emit!(Paused { vault: v.key() });
        Ok(())
    }

    pub fn request_unpause(ctx: Context<OwnerOnly>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let v = &mut ctx.accounts.vault;
        let next = policy::request_unpause(&state_of(v), now).map_err(map_err)?;
        apply(v, &next);
        emit!(UnpauseRequested {
            vault: v.key(),
            unpause_at: v.unpause_at
        });
        Ok(())
    }

    pub fn unpause(ctx: Context<OwnerOnly>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let v = &mut ctx.accounts.vault;
        let next = policy::unpause(&state_of(v), now).map_err(map_err)?;
        apply(v, &next);
        emit!(Unpaused {
            vault: v.key(),
            epoch: v.epoch
        });
        Ok(())
    }
}

fn state_of(v: &Vault) -> policy::State {
    policy::State {
        window_start: v.window_start,
        window_spent: v.window_spent,
        nonce: v.nonce,
        epoch: v.epoch,
        paused: v.paused,
        unpause_at: v.unpause_at,
    }
}
fn apply(v: &mut Vault, s: &policy::State) {
    v.window_start = s.window_start;
    v.window_spent = s.window_spent;
    v.nonce = s.nonce;
    v.epoch = s.epoch;
    v.paused = s.paused;
    v.unpause_at = s.unpause_at;
}
fn map_err(e: policy::PolicyError) -> Error {
    use policy::PolicyError as P;
    match e {
        P::InvalidPolicy => VaultError::InvalidPolicy,
        P::ZeroAmount => VaultError::ZeroAmount,
        P::Paused => VaultError::Paused,
        P::Locked => VaultError::Locked,
        P::Expired => VaultError::Expired,
        P::ExpiryTooFar => VaultError::ExpiryTooFar,
        P::WrongNonce => VaultError::WrongNonce,
        P::WrongEpoch => VaultError::WrongEpoch,
        P::WrongDestination => VaultError::WrongDestination,
        P::OverPerWithdraw => VaultError::OverPerWithdraw,
        P::OverDailyLimit => VaultError::OverDailyLimit,
        P::InsufficientEscrow => VaultError::InsufficientEscrow,
        P::Overflow => VaultError::Overflow,
        P::UnpauseNotRequested => VaultError::UnpauseNotRequested,
        P::UnpauseDelayActive => VaultError::UnpauseDelayActive,
        P::NotPaused => VaultError::NotPaused,
    }
    .into()
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub version: u8,
    pub bump: u8,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault_id: u64,
    pub decimals: u8,
    pub destination: Pubkey,
    pub max_per_withdraw: u64,
    pub daily_limit: u64,
    pub unlock_ts: i64,
    pub window_start: i64,
    pub window_spent: u64,
    pub nonce: u64,
    pub epoch: u32,
    pub paused: bool,
    pub unpause_at: i64,
}

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init, payer = owner, space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, owner.key().as_ref(), mint.key().as_ref(), &vault_id.to_le_bytes()], bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init, payer = owner,
        associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub escrow: Account<'info, TokenAccount>,
    /// Fixed allowed destination: must be a classic SPL token account for the vault mint.
    #[account(token::mint = mint, token::token_program = token_program)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub depositor: Signer<'info>,
    #[account(has_one = mint, constraint = vault.version == policy::ACCOUNT_VERSION @ VaultError::WrongVersion)]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = depositor)]
    pub source: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program)]
    pub escrow: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut, has_one = owner, has_one = mint,
        seeds = [VAULT_SEED, owner.key().as_ref(), mint.key().as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.version == policy::ACCOUNT_VERSION @ VaultError::WrongVersion
    )]
    pub vault: Account<'info, Vault>,
    pub mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault,
        associated_token::token_program = token_program)]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, address = vault.destination @ VaultError::WrongDestination, token::mint = mint)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner,
        seeds = [VAULT_SEED, owner.key().as_ref(), vault.mint.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault_id: u64,
    pub destination: Pubkey,
}
#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
}
#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub nonce: u64,
}
#[event]
pub struct Paused {
    pub vault: Pubkey,
}
#[event]
pub struct UnpauseRequested {
    pub vault: Pubkey,
    pub unpause_at: i64,
}
#[event]
pub struct Unpaused {
    pub vault: Pubkey,
    pub epoch: u32,
}

#[error_code]
pub enum VaultError {
    InvalidPolicy,
    ZeroAmount,
    Paused,
    Locked,
    Expired,
    ExpiryTooFar,
    WrongNonce,
    WrongEpoch,
    WrongDestination,
    OverPerWithdraw,
    OverDailyLimit,
    InsufficientEscrow,
    Overflow,
    UnpauseNotRequested,
    UnpauseDelayActive,
    NotPaused,
    WrongVersion,
}
