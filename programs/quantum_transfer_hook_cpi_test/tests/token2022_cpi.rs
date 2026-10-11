//! Real Token-2022 transfer CPI into the research hook, inside solana-program-test BanksServer.
//! The hook runs as a native processor; Token-2022 is the bundled program. Local only, no network.
use quantum_transfer_hook::{config_address, process_instruction, IX_INIT, IX_INIT_DBC, IX_SET};
use solana_program_test::{processor, tokio, ProgramTest, ProgramTestContext};
#[allow(deprecated)]
use solana_sdk::{
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::{Transaction, TransactionError},
};
use spl_token_2022::{
    extension::{transfer_hook, ExtensionType},
    instruction as tix,
    state::{Account, Mint},
};
use spl_transfer_hook_interface::get_extra_account_metas_address;

const DECIMALS: u8 = 0;

struct Env {
    ctx: ProgramTestContext,
    hook: Pubkey,
    mint: Keypair,
    authority: Keypair,
    src: Keypair,
    dst: Keypair,
    dst_owner: Keypair,
}

async fn send(ctx: &mut ProgramTestContext, ixs: &[Instruction], signers: &[&Keypair]) -> Result<(), TransactionError> {
    let bh = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let mut all: Vec<&Keypair> = vec![&ctx.payer];
    all.extend_from_slice(signers);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&ctx.payer.pubkey()), &all, bh);
    ctx.banks_client.process_transaction(tx).await.map_err(|e| e.unwrap())
}

fn policy(paused: bool, allow: &[Pubkey]) -> Vec<u8> {
    let mut v = vec![paused as u8, (!allow.is_empty()) as u8, allow.len() as u8];
    for a in allow {
        v.extend_from_slice(a.as_ref());
    }
    v
}

async fn setup() -> Env {
    let hook = Pubkey::new_unique(); // local test id only, NOT a deployed program
    // QLI_HOOK_SBF=1 loads the compiled SBF binary from SBF_OUT_DIR instead of the native processor.
    let sbf = std::env::var("QLI_HOOK_SBF").as_deref() == Ok("1");
    let mut pt = if sbf {
        ProgramTest::new("quantum_transfer_hook", hook, None)
    } else {
        ProgramTest::new("quantum_transfer_hook", hook, processor!(process_instruction))
    };
    pt.prefer_bpf(sbf);
    let mut ctx = pt.start_with_context().await;
    let (mint, authority, src, dst, dst_owner) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
    let t22 = spl_token_2022::id();
    let rent = ctx.banks_client.get_rent().await.unwrap();
    let mint_len = ExtensionType::try_calculate_account_len::<Mint>(&[ExtensionType::TransferHook]).unwrap();
    let acct_len = ExtensionType::try_calculate_account_len::<Account>(&[ExtensionType::TransferHookAccount]).unwrap();
    let payer = ctx.payer.pubkey();
    send(&mut ctx, &[
        system_instruction::create_account(&payer, &mint.pubkey(), rent.minimum_balance(mint_len), mint_len as u64, &t22),
        transfer_hook::instruction::initialize(&t22, &mint.pubkey(), Some(authority.pubkey()), Some(hook)).unwrap(),
        tix::initialize_mint2(&t22, &mint.pubkey(), &authority.pubkey(), None, DECIMALS).unwrap(),
        system_instruction::transfer(&payer, &authority.pubkey(), 1_000_000_000),
    ], &[&mint]).await.unwrap();
    for (acc, owner) in [(&src, authority.pubkey()), (&dst, dst_owner.pubkey())] {
        send(&mut ctx, &[
            system_instruction::create_account(&payer, &acc.pubkey(), rent.minimum_balance(acct_len), acct_len as u64, &t22),
            tix::initialize_account3(&t22, &acc.pubkey(), &mint.pubkey(), &owner).unwrap(),
        ], &[acc]).await.unwrap();
    }
    send(&mut ctx, &[tix::mint_to(&t22, &mint.pubkey(), &src.pubkey(), &authority.pubkey(), &[], 1_000).unwrap()], &[&authority]).await.unwrap();
    let (cfg, _) = config_address(&mint.pubkey(), &hook);
    let metas = get_extra_account_metas_address(&mint.pubkey(), &hook);
    let mut data = IX_INIT.to_vec();
    data.extend(policy(false, &[]));
    send(&mut ctx, &[Instruction::new_with_bytes(hook, &data, vec![
        AccountMeta::new(authority.pubkey(), true),
        AccountMeta::new(cfg, false),
        AccountMeta::new_readonly(mint.pubkey(), false),
        AccountMeta::new(metas, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ])], &[&authority]).await.unwrap();
    Env { ctx, hook, mint, authority, src, dst, dst_owner }
}

fn transfer_ix(e: &Env, amount: u64) -> Instruction {
    let mut ix = tix::transfer_checked(&spl_token_2022::id(), &e.src.pubkey(), &e.mint.pubkey(), &e.dst.pubkey(), &e.authority.pubkey(), &[], amount, DECIMALS).unwrap();
    // Extra accounts Token-2022 forwards to Execute: resolved metas, hook program, validation PDA.
    ix.accounts.push(AccountMeta::new_readonly(config_address(&e.mint.pubkey(), &e.hook).0, false));
    ix.accounts.push(AccountMeta::new_readonly(e.hook, false));
    ix.accounts.push(AccountMeta::new_readonly(get_extra_account_metas_address(&e.mint.pubkey(), &e.hook), false));
    ix
}

async fn set(e: &mut Env, signer_is_authority: bool, p: Vec<u8>) -> Result<(), TransactionError> {
    let s = if signer_is_authority { e.authority.insecure_clone() } else { Keypair::new() };
    let mut data = IX_SET.to_vec();
    data.extend(p);
    let ix = Instruction::new_with_bytes(e.hook, &data, vec![
        AccountMeta::new_readonly(s.pubkey(), true),
        AccountMeta::new(config_address(&e.mint.pubkey(), &e.hook).0, false),
        AccountMeta::new_readonly(e.mint.pubkey(), false),
    ]);
    send(&mut e.ctx, &[ix], &[&s]).await
}

fn custom(r: Result<(), TransactionError>) -> Option<u32> {
    match r {
        Err(TransactionError::InstructionError(_, InstructionError::Custom(c))) => Some(c),
        _ => None,
    }
}

#[tokio::test]
async fn token2022_cpi_enforces_policy() {
    let mut e = setup().await;
    let a = e.authority.insecure_clone();
    // 1. open policy: real transfer through Token-2022 succeeds
    let ix = transfer_ix(&e, 10);
    send(&mut e.ctx, &[ix], &[&a]).await.expect("open transfer");
    // 2. unauthorized pause refused
    assert_eq!(custom(set(&mut e, false, policy(true, &[])).await), Some(0x5108));
    // 3. authority pauses: transfer refused by hook (Paused = 0x5100)
    set(&mut e, true, policy(true, &[])).await.unwrap();
    let ix = transfer_ix(&e, 1);
    assert_eq!(custom(send(&mut e.ctx, &[ix], &[&a]).await), Some(0x5100));
    // 4. allowlist excluding receiver: refused (ReceiverNotAllowed = 0x5101)
    set(&mut e, true, policy(false, &[Pubkey::new_unique()])).await.unwrap();
    let ix = transfer_ix(&e, 1);
    assert_eq!(custom(send(&mut e.ctx, &[ix], &[&a]).await), Some(0x5101));
    // 5. allowlist including receiver owner: allowed
    let owner = e.dst_owner.pubkey();
    set(&mut e, true, policy(false, &[owner])).await.unwrap();
    let ix = transfer_ix(&e, 1);
    send(&mut e.ctx, &[ix], &[&a]).await.expect("allowlisted transfer");
    // 6. direct Execute outside a Token-2022 transfer: NotTransferring = 0x5102
    let direct = spl_transfer_hook_interface::instruction::TransferHookInstruction::Execute { amount: 1 }.pack();
    let ix = Instruction::new_with_bytes(e.hook, &direct, vec![
        AccountMeta::new_readonly(e.src.pubkey(), false),
        AccountMeta::new_readonly(e.mint.pubkey(), false),
        AccountMeta::new_readonly(e.dst.pubkey(), false),
        AccountMeta::new_readonly(e.authority.pubkey(), false),
        AccountMeta::new_readonly(get_extra_account_metas_address(&e.mint.pubkey(), &e.hook), false),
        AccountMeta::new_readonly(config_address(&e.mint.pubkey(), &e.hook).0, false),
    ]);
    assert_eq!(custom(send(&mut e.ctx, &[ix], &[]).await), Some(0x5102));
    // 7. transfer without the extra accounts fails
    let mut ix = transfer_ix(&e, 1);
    ix.accounts.truncate(4);
    assert!(send(&mut e.ctx, &[ix], &[&a]).await.is_err());
}

/// DBC-style bootstrap: TransferHook authority is an arbitrary PDA (stand-in for the Meteora DBC
/// pool authority), so the wallet cannot use qlihk:in. qlihk:db is appended AFTER mint
/// initialization in the SAME transaction, signed by the mint keypair + policy wallet.
#[tokio::test]
async fn token2022_cpi_dbc_mint_signer_bootstrap() {
    let hook = Pubkey::new_unique();
    let sbf = std::env::var("QLI_HOOK_SBF").as_deref() == Ok("1");
    let mut pt = if sbf { ProgramTest::new("quantum_transfer_hook", hook, None) } else { ProgramTest::new("quantum_transfer_hook", hook, processor!(process_instruction)) };
    pt.prefer_bpf(sbf);
    let mut ctx = pt.start_with_context().await;
    let (pda_auth, _) = Pubkey::find_program_address(&[b"pool_authority"], &Pubkey::new_unique());
    let (mint, operator, src, dst, dst_owner) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
    let t22 = spl_token_2022::id();
    let rent = ctx.banks_client.get_rent().await.unwrap();
    let mint_len = ExtensionType::try_calculate_account_len::<Mint>(&[ExtensionType::TransferHook]).unwrap();
    let acct_len = ExtensionType::try_calculate_account_len::<Account>(&[ExtensionType::TransferHookAccount]).unwrap();
    let payer = ctx.payer.pubkey();
    send(&mut ctx, &[system_instruction::transfer(&payer, &operator.pubkey(), 1_000_000_000)], &[]).await.unwrap();
    let (cfg, _) = config_address(&mint.pubkey(), &hook);
    let metas = get_extra_account_metas_address(&mint.pubkey(), &hook);
    let db = |p: Vec<u8>, mint_signs: bool| {
        let mut d = IX_INIT_DBC.to_vec();
        d.extend(p);
        Instruction::new_with_bytes(hook, &d, vec![
            AccountMeta::new(operator.pubkey(), true),
            AccountMeta::new(cfg, false),
            AccountMeta::new_readonly(mint.pubkey(), mint_signs),
            AccountMeta::new(metas, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ])
    };
    let create = vec![
        system_instruction::create_account(&payer, &mint.pubkey(), rent.minimum_balance(mint_len), mint_len as u64, &t22),
        transfer_hook::instruction::initialize(&t22, &mint.pubkey(), Some(pda_auth), Some(hook)).unwrap(),
        tix::initialize_mint2(&t22, &mint.pubkey(), &operator.pubkey(), None, DECIMALS).unwrap(),
    ];
    // wallet-style init is refused: operator is not the hook authority
    let mut wrong = create.clone();
    let mut d = IX_INIT.to_vec();
    d.extend(policy(false, &[]));
    wrong.push(Instruction::new_with_bytes(hook, &d, vec![
        AccountMeta::new(operator.pubkey(), true), AccountMeta::new(cfg, false),
        AccountMeta::new_readonly(mint.pubkey(), false), AccountMeta::new(metas, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ]));
    assert_eq!(custom(send(&mut ctx, &wrong, &[&mint, &operator]).await), Some(0x5108));
    // paused initial policy refused (BadPolicy = 0x5109)
    let mut bad = create.clone();
    bad.push(db(policy(true, &[]), true));
    assert_eq!(custom(send(&mut ctx, &bad, &[&mint, &operator]).await), Some(0x5109));
    // NOTE: a key that signs the transaction is a signer for every instruction in it, so the
    // "mint did not sign" case is covered in the hook unit tests (dbc_init_requires_mint_signer...).
    // correct: mint + operator sign, qlihk:db after mint init, same tx
    let mut ok = create.clone();
    ok.push(db(policy(false, &[]), true));
    send(&mut ctx, &ok, &[&mint, &operator]).await.expect("dbc bootstrap");
    // second init refused (already initialized)
    assert!(send(&mut ctx, &[db(policy(false, &[]), true)], &[&mint, &operator]).await.is_err());
    for (acc, owner) in [(&src, operator.pubkey()), (&dst, dst_owner.pubkey())] {
        send(&mut ctx, &[
            system_instruction::create_account(&payer, &acc.pubkey(), rent.minimum_balance(acct_len), acct_len as u64, &t22),
            tix::initialize_account3(&t22, &acc.pubkey(), &mint.pubkey(), &owner).unwrap(),
        ], &[acc]).await.unwrap();
    }
    send(&mut ctx, &[tix::mint_to(&t22, &mint.pubkey(), &src.pubkey(), &operator.pubkey(), &[], 100).unwrap()], &[&operator]).await.unwrap();
    let mut e = Env { ctx, hook, mint, authority: operator, src, dst, dst_owner };
    let a = e.authority.insecure_clone();
    let ix = transfer_ix(&e, 1);
    send(&mut e.ctx, &[ix], &[&a]).await.expect("open transfer");
    set(&mut e, true, policy(true, &[])).await.unwrap();
    let ix = transfer_ix(&e, 1);
    assert_eq!(custom(send(&mut e.ctx, &[ix], &[&a]).await), Some(0x5100));
    set(&mut e, true, policy(false, &[])).await.unwrap();
    let ix = transfer_ix(&e, 1);
    send(&mut e.ctx, &[ix], &[&a]).await.expect("unpaused transfer");
}