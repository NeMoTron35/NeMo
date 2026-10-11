use super::*;
use solana_program::account_info::AccountInfo;

const PID: Pubkey = pubkey!("QLiHook111111111111111111111111111111111111"); // local test id, NOT deployed

fn token_acct(mint: &Pubkey, owner: &Pubkey, transferring: Option<bool>) -> Vec<u8> {
    let mut d = vec![0u8; BASE_LEN];
    d[..32].copy_from_slice(mint.as_ref());
    d[32..64].copy_from_slice(owner.as_ref());
    if let Some(t) = transferring {
        d.push(ACCOUNT_TYPE_ACCOUNT);
        d.extend_from_slice(&EXT_TRANSFER_HOOK_ACCOUNT.to_le_bytes());
        d.extend_from_slice(&1u16.to_le_bytes());
        d.push(t as u8);
    }
    d
}
fn mint_data(authority: &Pubkey, program: &Pubkey) -> Vec<u8> {
    let mut d = vec![0u8; BASE_LEN];
    d.push(ACCOUNT_TYPE_MINT);
    d.extend_from_slice(&EXT_TRANSFER_HOOK.to_le_bytes());
    d.extend_from_slice(&64u16.to_le_bytes());
    d.extend_from_slice(authority.as_ref());
    d.extend_from_slice(program.as_ref());
    d
}

struct Acc {
    key: Pubkey,
    signer: bool,
    lamports: u64,
    data: Vec<u8>,
    owner: Pubkey,
}
impl Acc {
    fn new(key: Pubkey, owner: Pubkey, data: Vec<u8>) -> Self {
        Acc { key, signer: false, lamports: 1, data, owner }
    }
}
fn run(accs: &mut [Acc], ix: &[u8]) -> ProgramResult {
    let infos: Vec<AccountInfo> = accs
        .iter_mut()
        .map(|a| AccountInfo::new(&a.key, a.signer, true, &mut a.lamports, &mut a.data, &a.owner, false, 0))
        .collect();
    process_instruction(&PID, &infos, ix)
}

struct World {
    mint: Pubkey,
    authority: Pubkey,
    receiver: Pubkey,
}
fn world() -> World {
    World { mint: Pubkey::new_unique(), authority: Pubkey::new_unique(), receiver: Pubkey::new_unique() }
}
fn execute_accounts(w: &World, p: &Policy, transferring: Option<bool>, dst_owner: Pubkey) -> Vec<Acc> {
    let (cfg, bump) = config_address(&w.mint, &PID);
    let (metas, _) = get_extra_account_metas_address_and_bump_seed(&w.mint, &PID);
    vec![
        Acc::new(Pubkey::new_unique(), TOKEN_2022, token_acct(&w.mint, &Pubkey::new_unique(), transferring)),
        Acc::new(w.mint, TOKEN_2022, mint_data(&w.authority, &PID)),
        Acc::new(Pubkey::new_unique(), TOKEN_2022, token_acct(&w.mint, &dst_owner, None)),
        Acc::new(Pubkey::new_unique(), system_program::ID, vec![]),
        Acc::new(metas, PID, vec![0; 64]),
        Acc::new(cfg, PID, encode_config(bump, &w.authority, &w.mint, p)),
    ]
}
fn exec_ix() -> Vec<u8> {
    TransferHookInstruction::Execute { amount: 5 }.pack()
}
const OPEN: fn() -> Policy = || Policy { paused: false, allowlist: false, allowed: vec![] };
fn err(e: HookError) -> ProgramResult {
    Err(ProgramError::Custom(e as u32))
}

#[test]
fn execute_discriminator_is_interface_standard() {
    // sha256("spl-transfer-hook-interface:execute")[..8]
    assert_eq!(&exec_ix()[..8], &[105, 37, 101, 197, 75, 251, 102, 26]);
}

#[test]
fn allows_transfer_inside_token_cpi() {
    let w = world();
    assert_eq!(run(&mut execute_accounts(&w, &OPEN(), Some(true), w.receiver), &exec_ix()), Ok(()));
}

#[test]
fn refuses_direct_invocation_outside_transfer() {
    let w = world();
    assert_eq!(run(&mut execute_accounts(&w, &OPEN(), Some(false), w.receiver), &exec_ix()), err(HookError::NotTransferring));
    assert_eq!(run(&mut execute_accounts(&w, &OPEN(), None, w.receiver), &exec_ix()), err(HookError::NotTransferring));
}

#[test]
fn pause_and_allowlist_enforced() {
    let w = world();
    let paused = Policy { paused: true, ..OPEN() };
    assert_eq!(run(&mut execute_accounts(&w, &paused, Some(true), w.receiver), &exec_ix()), err(HookError::Paused));
    let al = Policy { paused: false, allowlist: true, allowed: vec![w.receiver.to_bytes()] };
    assert_eq!(run(&mut execute_accounts(&w, &al, Some(true), w.receiver), &exec_ix()), Ok(()));
    assert_eq!(
        run(&mut execute_accounts(&w, &al, Some(true), Pubkey::new_unique()), &exec_ix()),
        err(HookError::ReceiverNotAllowed)
    );
}

#[test]
fn rejects_spoofed_accounts() {
    let w = world();
    // config owned by another program
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[5].owner = Pubkey::new_unique();
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadConfig));
    // config at wrong address
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[5].key = Pubkey::new_unique();
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadConfig));
    // config for a different mint at the right PDA is impossible; tamper stored mint instead
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[5].data[44] ^= 1;
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadConfig));
    // extra metas wrong owner
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[4].owner = Pubkey::new_unique();
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadExtraMetas));
    // source not Token-2022 (classic SPL owner)
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[0].owner = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadSourceAccount));
    // destination for another mint
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a[2].data[0] ^= 1;
    assert_eq!(run(&mut a, &exec_ix()), err(HookError::BadDestinationAccount));
}

#[test]
fn missing_extra_accounts_fail() {
    let w = world();
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    a.truncate(5);
    assert_eq!(run(&mut a, &exec_ix()), Err(ProgramError::NotEnoughAccountKeys));
}

fn set_ix(paused: bool) -> Vec<u8> {
    let mut v = IX_SET.to_vec();
    v.extend_from_slice(&[paused as u8, 0, 0]);
    v
}

#[test]
fn only_stored_authority_can_set_policy() {
    let w = world();
    let mk = |signer: Pubkey, is_signer: bool| {
        let a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
        let cfg = a.into_iter().nth(5).unwrap();
        let mut s = Acc::new(signer, system_program::ID, vec![]);
        s.signer = is_signer;
        vec![s, cfg, Acc::new(w.mint, TOKEN_2022, mint_data(&w.authority, &PID))]
    };
    assert_eq!(run(&mut mk(Pubkey::new_unique(), true), &set_ix(true)), err(HookError::Unauthorized));
    assert_eq!(run(&mut mk(w.authority, false), &set_ix(true)), err(HookError::Unauthorized));
    let mut ok = mk(w.authority, true);
    assert_eq!(run(&mut ok, &set_ix(true)), Ok(()));
    assert!(decode_config(&ok[1].data).unwrap().policy.paused);
    // authority can always unpause
    assert_eq!(run(&mut ok, &set_ix(false)), Ok(()));
    assert!(!decode_config(&ok[1].data).unwrap().policy.paused);
}

#[test]
fn init_requires_mint_hook_authority_and_signer() {
    let w = world();
    let (cfg, _) = config_address(&w.mint, &PID);
    let (metas, _) = get_extra_account_metas_address_and_bump_seed(&w.mint, &PID);
    let mut ix = IX_INIT.to_vec();
    ix.extend_from_slice(&[0, 0, 0]);
    let build = |signer: Pubkey, hook_prog: Pubkey| {
        let mut s = Acc::new(signer, system_program::ID, vec![]);
        s.signer = true;
        vec![
            s,
            Acc { lamports: 0, ..Acc::new(cfg, system_program::ID, vec![]) },
            Acc::new(w.mint, TOKEN_2022, mint_data(&w.authority, &hook_prog)),
            Acc { lamports: 0, ..Acc::new(metas, system_program::ID, vec![]) },
            Acc::new(system_program::ID, Pubkey::default(), vec![]),
        ]
    };
    assert_eq!(run(&mut build(Pubkey::new_unique(), PID), &ix), err(HookError::Unauthorized));
    assert_eq!(run(&mut build(w.authority, Pubkey::new_unique()), &ix), err(HookError::BadMint));
}

#[test]
fn policy_bounds() {
    assert_eq!(validate_policy(&Policy { paused: false, allowlist: true, allowed: vec![] }), Err(HookError::BadPolicy));
    assert_eq!(validate_policy(&Policy { paused: false, allowlist: false, allowed: vec![[1; 32]; 9] }), Err(HookError::BadPolicy));
    assert_eq!(validate_policy(&Policy { paused: false, allowlist: true, allowed: vec![[1; 32], [1; 32]] }), Err(HookError::BadPolicy));
    assert_eq!(parse_policy(&[2, 0, 0]), Err(HookError::BadPolicy));
    assert_eq!(parse_policy(&[0, 0, 1]), Err(HookError::BadPolicy));
    assert!(parse_policy(&[0, 1, 1].iter().copied().chain([7u8; 32]).collect::<Vec<_>>()).is_ok());
}

#[test]
fn tlv_parser_is_bounded() {
    let mut d = vec![0u8; BASE_LEN];
    d.push(ACCOUNT_TYPE_ACCOUNT);
    d.extend_from_slice(&EXT_TRANSFER_HOOK_ACCOUNT.to_le_bytes());
    d.extend_from_slice(&500u16.to_le_bytes());
    assert!(!is_transferring(&d));
    assert!(mint_hook(&[0u8; 10]).is_none());
}

#[test]
fn unknown_interface_instruction_refused() {
    let w = world();
    let mut a = execute_accounts(&w, &OPEN(), Some(true), w.receiver);
    let ix = TransferHookInstruction::InitializeExtraAccountMetaList { extra_account_metas: vec![] }.pack();
    assert_eq!(run(&mut a, &ix), err(HookError::UnsupportedInstruction));
}

#[test]
fn extra_metas_list_initializes_for_execute() {
    let list = extra_metas().unwrap();
    let mut buf = vec![0u8; ExtraAccountMetaList::size_of(list.len()).unwrap()];
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut buf, &list).unwrap();
    assert_eq!(ExtraAccountMetaList::size_of(1).unwrap(), buf.len());
}