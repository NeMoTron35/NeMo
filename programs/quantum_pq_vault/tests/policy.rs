use quantum_pq_vault::*;

const SEED: Key = [7; 32];
fn devnet() -> Key { DEVNET_GENESIS }
fn k(b: u8) -> Key { [b; 32] }

struct Keys { sks: Vec<Vec<Key>>, tree: Vec<Vec<Key>> }
fn sk(leaf: u32, i: usize) -> Key { sha256(&[b"test-sk".as_slice(), &leaf.to_be_bytes(), &[i as u8]].concat()) }
fn keygen() -> Keys {
    let mut sks = vec![]; let mut leaves = vec![];
    for leaf in 0..LEAVES {
        let s: Vec<Key> = (0..CHAINS).map(|i| sk(leaf, i)).collect();
        let mut pks = vec![];
        for (i, x) in s.iter().enumerate() {
            let mut c = *x;
            for j in 0..15u8 { c = chain_step(&SEED, leaf, i as u8, j, &c); }
            pks.extend_from_slice(&c);
        }
        leaves.push(leaf_hash(&SEED, leaf, &pks)); sks.push(s);
    }
    let mut tree = vec![leaves];
    for level in 0..HEIGHT {
        let prev = &tree[level];
        let next = (0..prev.len() / 2).map(|p| node_hash(&SEED, level as u8, p as u32, &prev[2 * p], &prev[2 * p + 1])).collect();
        tree.push(next);
    }
    Keys { sks, tree }
}
fn sign(keys: &Keys, it: &Intent) -> Vec<u8> {
    let d = digits(&intent_digest(it));
    let leaf = it.leaf;
    let mut out = leaf.to_le_bytes().to_vec();
    for i in 0..CHAINS {
        let mut c = keys.sks[leaf as usize][i];
        for j in 0..d[i] { c = chain_step(&SEED, leaf, i as u8, j, &c); }
        out.extend_from_slice(&c);
    }
    let mut idx = leaf as usize;
    for level in 0..HEIGHT { out.extend_from_slice(&keys.tree[level][idx ^ 1]); idx >>= 1; }
    out
}

struct Fx { keys: Keys, vault: Vault }
fn fx() -> Fx {
    let keys = keygen();
    let root = keys.tree[HEIGHT][0];
    let vault = Vault::create(k(0x50), k(1), k(2), root, SEED, k(3), k(4), k(5), k(6), devnet(), &devnet()).unwrap();
    Fx { keys, vault }
}
fn intent(v: &Vault, leaf: u32, nonce: u64) -> Intent {
    Intent { program: v.program, vault: v.address, mint: v.mint, escrow: v.escrow, destination: v.destination, amount: 500, genesis: v.genesis, nonce, expires_at: 1_000, leaf, epoch: 0 }
}
fn facts(v: &Vault) -> ChainFacts {
    ChainFacts { genesis: v.genesis, now: 100, escrow_owner: v.address, escrow_mint: v.mint, escrow_amount: 1_000, destination_mint: v.mint, destination_owner: v.destination_owner }
}
fn staged(v: &Vault, proof: &[u8]) -> Session {
    let mut s = Session::open(false, k(9), v, sha256(proof), 50, 600, 2_000_000).unwrap();
    for (i, c) in proof.chunks(MAX_CHUNK).enumerate() { s.append(&k(9), i, c, 60).unwrap(); }
    s
}

#[test]
fn full_policy_matrix() {
    let Fx { keys, mut vault } = fx();
    let fv = facts(&vault);
    assert_eq!(PROOF_BYTES.div_ceil(MAX_CHUNK), CHUNKS);

    // Valid 3-chunk proof releases exactly one transfer to the canonical destination.
    let it = intent(&vault, 3, 1);
    let proof = sign(&keys, &it);
    let mut s = staged(&vault, &proof);
    let mut n = 0;
    let plan = s.withdraw(&k(9), &mut vault, &it, &fv, &mut n).unwrap();
    assert_eq!(plan, TransferPlan { from: k(4), to: k(5), authority: k(1), mint: k(3), amount: 500 });
    assert!(n <= 67 * 15 + 9);
    println!("sha256 calls for vector: {n}; worst-case CU estimate {}", estimated_withdraw_cu());
    assert!(estimated_withdraw_cu() < 1_400_000);

    // Leaf replay through a fresh session (account reset) is refused by the vault bitmap.
    let it2 = Intent { nonce: 2, ..it };
    let mut s2 = staged(&vault, &sign(&keys, &it2));
    assert_eq!(s2.withdraw(&k(9), &mut vault, &it2, &fv, &mut n), Err(PqError::Replay));
    // Same session cannot be reused.
    assert_eq!(s.withdraw(&k(9), &mut vault, &it, &fv, &mut n), Err(PqError::SessionClosed));
    // Nonce must increase.
    let it3 = intent(&vault, 4, 1);
    let mut s3 = staged(&vault, &sign(&keys, &it3));
    assert_eq!(s3.withdraw(&k(9), &mut vault, &it3, &fv, &mut n), Err(PqError::NonceNotIncreasing));

    // Each bound field: a proof signed for one value is rejected for another.
    let base = intent(&vault, 10, 5);
    let p = sign(&keys, &base);
    let cases: Vec<(Intent, PqError)> = vec![
        (Intent { amount: 501, ..base }, PqError::RootMismatch),
        (Intent { expires_at: 999, ..base }, PqError::RootMismatch),
        (Intent { nonce: 6, ..base }, PqError::RootMismatch),
        (Intent { destination: k(8), ..base }, PqError::WrongDestination),
        (Intent { mint: k(8), ..base }, PqError::WrongMint),
        (Intent { vault: k(8), ..base }, PqError::WrongVault),
        (Intent { program: k(8), ..base }, PqError::WrongVault),
        (Intent { escrow: k(8), ..base }, PqError::WrongEscrow),
        (Intent { genesis: k(8), ..base }, PqError::WrongGenesis),
        (Intent { leaf: 11, ..base }, PqError::RootMismatch),
    ];
    for (bad, err) in cases {
        let mut s = staged(&vault, &p);
        assert_eq!(s.withdraw(&k(9), &mut vault, &bad, &fv, &mut n), Err(err), "{bad:?}");
    }
    // Wrong root (different vault keys).
    let mut other = vault.clone(); other.root = k(0xAA);
    assert_eq!(staged(&other, &p).withdraw(&k(9), &mut other, &base, &fv, &mut n), Err(PqError::RootMismatch));
    // Expired.
    let mut f = fv; f.now = 1_001;
    assert_eq!(staged(&vault, &p).withdraw(&k(9), &mut vault, &base, &f, &mut n), Err(PqError::Expired));
    // Escrow not PDA-owned / mint mismatch / destination owner changed / slippage on amount.
    let mut f = fv; f.escrow_owner = k(2);
    assert_eq!(staged(&vault, &p).withdraw(&k(9), &mut vault, &base, &f, &mut n), Err(PqError::EscrowNotPdaOwned));
    let mut f = fv; f.destination_mint = k(8);
    assert_eq!(staged(&vault, &p).withdraw(&k(9), &mut vault, &base, &f, &mut n), Err(PqError::WrongMint));
    let mut f = fv; f.destination_owner = k(8);
    assert_eq!(staged(&vault, &p).withdraw(&k(9), &mut vault, &base, &f, &mut n), Err(PqError::DestinationOwnerMismatch));
    let mut f = fv; f.escrow_amount = 499;
    assert_eq!(staged(&vault, &p).withdraw(&k(9), &mut vault, &base, &f, &mut n), Err(PqError::InsufficientEscrow));

    // Chunk tampering, reordering, duplicates, missing, oversize, wrong payer.
    let mut t = p.clone(); t[100] ^= 1;
    let mut s = Session::open(false, k(9), &vault, sha256(&p), 50, 600, 1).unwrap();
    for (i, c) in t.chunks(MAX_CHUNK).enumerate() { s.append(&k(9), i, c, 60).unwrap(); }
    assert_eq!(s.withdraw(&k(9), &mut vault, &base, &fv, &mut n), Err(PqError::CommitmentMismatch));
    let cs: Vec<&[u8]> = p.chunks(MAX_CHUNK).collect();
    let mut s = Session::open(false, k(9), &vault, sha256(&p), 50, 600, 1).unwrap();
    s.append(&k(9), 0, cs[1], 60).unwrap(); s.append(&k(9), 1, cs[0], 60).unwrap(); s.append(&k(9), 2, cs[2], 60).unwrap();
    assert_eq!(s.withdraw(&k(9), &mut vault, &base, &fv, &mut n), Err(PqError::CommitmentMismatch));
    let mut s = Session::open(false, k(9), &vault, sha256(&p), 50, 600, 1).unwrap();
    s.append(&k(9), 0, cs[0], 60).unwrap();
    assert_eq!(s.append(&k(9), 0, cs[0], 60), Err(PqError::ChunkDuplicate));
    assert_eq!(s.append(&k(9), 3, cs[0], 60), Err(PqError::ChunkIndex));
    assert_eq!(s.append(&k(9), 1, &[0u8; MAX_CHUNK + 1], 60), Err(PqError::ChunkTooLarge));
    assert_eq!(s.append(&k(8), 1, cs[1], 60), Err(PqError::WrongPayer)); // rent/overwrite grief
    assert_eq!(s.append(&k(9), 1, cs[1], 700), Err(PqError::Expired));
    assert_eq!(s.withdraw(&k(9), &mut vault, &base, &fv, &mut n), Err(PqError::MissingChunks));
    assert_eq!(s.withdraw(&k(8), &mut vault, &base, &fv, &mut n), Err(PqError::WrongPayer));

    // Session lifecycle: no overwrite, bounded TTL, rent refund only to payer after expiry/use.
    assert_eq!(Session::open(true, k(9), &vault, k(0), 0, 60, 1).err(), Some(PqError::SessionBusy));
    assert_eq!(Session::open(false, k(9), &vault, k(0), 0, 901, 1).err(), Some(PqError::BadTtl));
    assert_eq!(s.close(&k(9), &k(9), 100), Err(PqError::SessionOpen));
    assert_eq!(s.close(&k(8), &k(8), 10_000), Err(PqError::WrongPayer));
    assert_eq!(s.close(&k(9), &k(8), 10_000), Err(PqError::WrongPayer));
    assert_eq!(s.close(&k(9), &k(9), 10_000), Ok((k(9), 1)));

    // A vault cannot be created off Devnet, and the deployment gate stays closed while unverified.
    assert_eq!(Vault::create(k(0x50), k(1), k(2), k(0), SEED, k(3), k(4), k(5), k(6), k(0x11), &devnet()).err(), Some(PqError::NotDevnet));
    assert_eq!(deployment_gate(None, (k(1), k(2), k(3))), Err(PqError::ProgramNotVerified));
    assert_eq!(deployment_gate(Some((k(1), k(2), k(3))), (k(1), k(2), k(4))), Err(PqError::ProgramNotVerified));

    // First-buy receiver verification: PDA-owned escrow of this mint, delta >= minOut.
    let mut f = fv; f.escrow_amount = 1_000;
    assert_eq!(vault.verify_first_buy(0, &f, 1_000), Ok(1_000));
    assert_eq!(vault.verify_first_buy(0, &f, 1_001), Err(PqError::BelowMinimumOut));
    assert_eq!(vault.verify_first_buy(0, &f, 0), Err(PqError::BelowMinimumOut));
    f.escrow_owner = vault.creator; // tokens sent to creator wallet are not "vaulted"
    assert_eq!(vault.verify_first_buy(0, &f, 1), Err(PqError::EscrowNotPdaOwned));
    assert!(VAULT_ACCOUNT_BYTES < 400 && SESSION_ACCOUNT_BYTES < 2_600);
}