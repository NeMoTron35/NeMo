//! QuantumQLi research Transfer Hook program (Solana Transfer Hook Interface).
//!
//! RESEARCH ONLY. NOT DEPLOYED. NOT AUDITED. No program id in this crate is a deployed address.
//!
//! Policy (mint-scoped, bounded):
//! * global `paused` flag: when set, every Token-2022 transfer of the mint is refused;
//! * optional receiver allowlist (max 8 wallet owners): when mode = allowlist, the destination
//!   token account owner must be listed.
//!
//! Safety properties:
//! * `Execute` only succeeds when the source token account carries the Token-2022
//!   `TransferHookAccount` extension with `transferring == true`, i.e. inside a real Token-2022
//!   transfer CPI. Direct invocation outside a transfer is refused.
//! * Only the mint's TransferHook authority can create the policy; only the stored authority can
//!   change it. The only CPI is to the System Program to allocate the two PDAs.
//! * No fund movement, no delegates, no fees, no counters. An allowlist can never be empty, and the
//!   authority can always unpause, so the policy cannot permanently freeze the mint by itself.
//!   Token-2022 can also remove the hook (TransferHook authority sets program id to none).
//! * The hook only runs on Token-2022 token transfers. It is not a swap callback.

#[allow(deprecated)]
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};

pub const TOKEN_2022: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const CONFIG_SEED: &[u8] = b"qli-hook-config";
pub const CONFIG_TAG: [u8; 8] = *b"QLIHOOK1";
pub const MAX_ALLOW: usize = 8;
pub const CONFIG_LEN: usize = 8 + 4 + 32 + 32 + 1 + 32 * MAX_ALLOW;
pub const IX_INIT: [u8; 8] = *b"qlihk:in";
pub const IX_SET: [u8; 8] = *b"qlihk:sp";

/// Token-2022 extension type ids (spl-token-2022 ExtensionType).
pub const EXT_TRANSFER_HOOK: u16 = 14;
pub const EXT_TRANSFER_HOOK_ACCOUNT: u16 = 15;
const ACCOUNT_TYPE_MINT: u8 = 1;
const ACCOUNT_TYPE_ACCOUNT: u8 = 2;
const BASE_LEN: usize = 165;

#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookError {
    Paused = 0x5100,
    ReceiverNotAllowed,
    NotTransferring,
    BadSourceAccount,
    BadDestinationAccount,
    BadMint,
    BadConfig,
    BadExtraMetas,
    Unauthorized,
    BadPolicy,
    UnsupportedInstruction,
}
impl From<HookError> for ProgramError {
    fn from(e: HookError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    pub paused: bool,
    pub allowlist: bool,
    pub allowed: Vec<[u8; 32]>,
}

/// Pure decision used by `Execute`. Returns the refusal reason, if any.
pub fn decide(p: &Policy, receiver_owner: &[u8; 32]) -> Result<(), HookError> {
    if p.paused {
        return Err(HookError::Paused);
    }
    if p.allowlist && !p.allowed.iter().any(|a| a == receiver_owner) {
        return Err(HookError::ReceiverNotAllowed);
    }
    Ok(())
}

/// Validate a requested policy: allowlist mode needs 1..=8 unique entries.
pub fn validate_policy(p: &Policy) -> Result<(), HookError> {
    if p.allowed.len() > MAX_ALLOW || (p.allowlist && p.allowed.is_empty()) {
        return Err(HookError::BadPolicy);
    }
    for (i, a) in p.allowed.iter().enumerate() {
        if p.allowed[..i].contains(a) {
            return Err(HookError::BadPolicy);
        }
    }
    Ok(())
}

/// Find a Token-2022 TLV extension value after the 165-byte base + account type byte.
pub fn find_ext(data: &[u8], account_type: u8, ext: u16) -> Option<&[u8]> {
    if data.len() <= BASE_LEN || data[BASE_LEN] != account_type {
        return None;
    }
    let mut o = BASE_LEN + 1;
    while o + 4 <= data.len() {
        let t = u16::from_le_bytes([data[o], data[o + 1]]);
        let l = u16::from_le_bytes([data[o + 2], data[o + 3]]) as usize;
        let start = o + 4;
        if start + l > data.len() {
            return None;
        }
        if t == ext {
            return Some(&data[start..start + l]);
        }
        if t == 0 && l == 0 {
            return None;
        }
        o = start + l;
    }
    None
}

/// Source token account must be in the middle of a Token-2022 transfer.
pub fn is_transferring(token_account: &[u8]) -> bool {
    matches!(find_ext(token_account, ACCOUNT_TYPE_ACCOUNT, EXT_TRANSFER_HOOK_ACCOUNT), Some(v) if v.first() == Some(&1))
}

/// (authority, program_id) from a mint's TransferHook extension.
pub fn mint_hook(mint: &[u8]) -> Option<([u8; 32], [u8; 32])> {
    let v = find_ext(mint, ACCOUNT_TYPE_MINT, EXT_TRANSFER_HOOK)?;
    if v.len() != 64 {
        return None;
    }
    Some((v[..32].try_into().ok()?, v[32..].try_into().ok()?))
}

pub fn encode_config(bump: u8, authority: &Pubkey, mint: &Pubkey, p: &Policy) -> Vec<u8> {
    let mut d = vec![0u8; CONFIG_LEN];
    d[..8].copy_from_slice(&CONFIG_TAG);
    d[8] = 1; // version
    d[9] = bump;
    d[10] = p.paused as u8;
    d[11] = p.allowlist as u8;
    d[12..44].copy_from_slice(authority.as_ref());
    d[44..76].copy_from_slice(mint.as_ref());
    d[76] = p.allowed.len() as u8;
    for (i, a) in p.allowed.iter().enumerate() {
        d[77 + 32 * i..109 + 32 * i].copy_from_slice(a);
    }
    d
}
pub struct Config {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub policy: Policy,
}
pub fn decode_config(d: &[u8]) -> Result<Config, HookError> {
    if d.len() != CONFIG_LEN || d[..8] != CONFIG_TAG || d[8] != 1 || d[10] > 1 || d[11] > 1 {
        return Err(HookError::BadConfig);
    }
    let n = d[76] as usize;
    if n > MAX_ALLOW {
        return Err(HookError::BadConfig);
    }
    let allowed = (0..n).map(|i| d[77 + 32 * i..109 + 32 * i].try_into().unwrap()).collect();
    Ok(Config {
        authority: Pubkey::new_from_array(d[12..44].try_into().unwrap()),
        mint: Pubkey::new_from_array(d[44..76].try_into().unwrap()),
        policy: Policy { paused: d[10] == 1, allowlist: d[11] == 1, allowed },
    })
}

/// Policy wire format: paused u8, allowlist u8, count u8, count * 32 bytes.
pub fn parse_policy(b: &[u8]) -> Result<Policy, HookError> {
    if b.len() < 3 || b[0] > 1 || b[1] > 1 {
        return Err(HookError::BadPolicy);
    }
    let n = b[2] as usize;
    if n > MAX_ALLOW || b.len() != 3 + 32 * n {
        return Err(HookError::BadPolicy);
    }
    let allowed = (0..n).map(|i| b[3 + 32 * i..35 + 32 * i].try_into().unwrap()).collect();
    let p = Policy { paused: b[0] == 1, allowlist: b[1] == 1, allowed };
    validate_policy(&p)?;
    Ok(p)
}

pub fn config_address(mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[CONFIG_SEED, mint.as_ref()], program_id)
}

/// Extra account resolved by Token-2022 for Execute: the config PDA [CONFIG_SEED, mint].
pub fn extra_metas() -> Result<Vec<ExtraAccountMeta>, ProgramError> {
    Ok(vec![ExtraAccountMeta::new_with_seeds(
        &[Seed::Literal { bytes: CONFIG_SEED.to_vec() }, Seed::AccountKey { index: 1 }],
        false,
        false,
    )?])
}

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    if input.len() >= 8 && input[..8] == IX_INIT {
        return init(program_id, accounts, &input[8..]);
    }
    if input.len() >= 8 && input[..8] == IX_SET {
        return set_policy(program_id, accounts, &input[8..]);
    }
    match TransferHookInstruction::unpack(input)? {
        TransferHookInstruction::Execute { .. } => execute(program_id, accounts),
        // Extra metas are written once by IX_INIT together with the policy.
        _ => Err(HookError::UnsupportedInstruction.into()),
    }
}

fn check_mint(mint: &AccountInfo, program_id: &Pubkey) -> Result<[u8; 32], ProgramError> {
    if mint.owner != &TOKEN_2022 {
        return Err(HookError::BadMint.into());
    }
    let d = mint.try_borrow_data()?;
    let (auth, prog) = mint_hook(&d).ok_or(HookError::BadMint)?;
    if prog != program_id.to_bytes() {
        return Err(HookError::BadMint.into());
    }
    Ok(auth)
}

fn create_pda<'a>(payer: &AccountInfo<'a>, target: &AccountInfo<'a>, sys: &AccountInfo<'a>, len: usize, program_id: &Pubkey, seeds: &[&[u8]]) -> ProgramResult {
    if target.lamports() != 0 || !target.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let lamports = Rent::get()?.minimum_balance(len);
    invoke_signed(
        &system_instruction::create_account(payer.key, target.key, lamports, len as u64, program_id),
        &[payer.clone(), target.clone(), sys.clone()],
        &[seeds],
    )
}

fn init(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let authority = next_account_info(it)?;
    let config = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let metas = next_account_info(it)?;
    let sys = next_account_info(it)?;
    if !authority.is_signer {
        return Err(HookError::Unauthorized.into());
    }
    if sys.key != &system_program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    let hook_authority = check_mint(mint, program_id)?;
    if hook_authority != authority.key.to_bytes() {
        return Err(HookError::Unauthorized.into());
    }
    let policy = parse_policy(data)?;
    let (cfg_addr, cfg_bump) = config_address(mint.key, program_id);
    if config.key != &cfg_addr {
        return Err(HookError::BadConfig.into());
    }
    let (meta_addr, meta_bump) = get_extra_account_metas_address_and_bump_seed(mint.key, program_id);
    if metas.key != &meta_addr {
        return Err(HookError::BadExtraMetas.into());
    }
    create_pda(authority, config, sys, CONFIG_LEN, program_id, &[CONFIG_SEED, mint.key.as_ref(), &[cfg_bump]])?;
    config.try_borrow_mut_data()?.copy_from_slice(&encode_config(cfg_bump, authority.key, mint.key, &policy));
    let list = extra_metas()?;
    let len = ExtraAccountMetaList::size_of(list.len())?;
    create_pda(authority, metas, sys, len, program_id, &[b"extra-account-metas", mint.key.as_ref(), &[meta_bump]])?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut metas.try_borrow_mut_data()?, &list)?;
    Ok(())
}

fn load_config(program_id: &Pubkey, config: &AccountInfo, mint: &Pubkey) -> Result<Config, ProgramError> {
    if config.owner != program_id || config.key != &config_address(mint, program_id).0 {
        return Err(HookError::BadConfig.into());
    }
    let c = decode_config(&config.try_borrow_data()?)?;
    if &c.mint != mint {
        return Err(HookError::BadConfig.into());
    }
    Ok(c)
}

fn set_policy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let authority = next_account_info(it)?;
    let config = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let c = load_config(program_id, config, mint.key)?;
    if !authority.is_signer || authority.key != &c.authority {
        return Err(HookError::Unauthorized.into());
    }
    let policy = parse_policy(data)?;
    let bump = config.try_borrow_data()?[9];
    config.try_borrow_mut_data()?.copy_from_slice(&encode_config(bump, &c.authority, &c.mint, &policy));
    Ok(())
}

fn token_account_mint_owner(acc: &AccountInfo) -> Option<([u8; 32], [u8; 32])> {
    if acc.owner != &TOKEN_2022 {
        return None;
    }
    let d = acc.try_borrow_data().ok()?;
    if d.len() < 64 {
        return None;
    }
    Some((d[..32].try_into().ok()?, d[32..64].try_into().ok()?))
}

fn execute(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let source = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let destination = next_account_info(it)?;
    let _owner = next_account_info(it)?;
    let metas = next_account_info(it)?;
    let config = next_account_info(it)?;
    let (src_mint, _) = token_account_mint_owner(source).ok_or(HookError::BadSourceAccount)?;
    if src_mint != mint.key.to_bytes() {
        return Err(HookError::BadSourceAccount.into());
    }
    if !is_transferring(&source.try_borrow_data()?) {
        return Err(HookError::NotTransferring.into());
    }
    let (dst_mint, dst_owner) = token_account_mint_owner(destination).ok_or(HookError::BadDestinationAccount)?;
    if dst_mint != mint.key.to_bytes() {
        return Err(HookError::BadDestinationAccount.into());
    }
    if metas.owner != program_id || metas.key != &get_extra_account_metas_address_and_bump_seed(mint.key, program_id).0 {
        return Err(HookError::BadExtraMetas.into());
    }
    let c = load_config(program_id, config, mint.key)?;
    decide(&c.policy, &dst_owner)?;
    Ok(())
}

#[cfg(test)]
mod tests;