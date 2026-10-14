use quantum_pq_vault::*;
fn b58(s: &str) -> [u8; 32] {
    const A: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut out = [0u8; 32];
    for c in s.bytes() {
        let mut carry = A.iter().position(|&x| x == c).unwrap() as u32;
        for b in out.iter_mut().rev() {
            carry += (*b as u32) * 58;
            *b = carry as u8;
            carry >>= 8;
        }
        assert_eq!(carry, 0);
    }
    out
}
#[test]
fn frozen_genesis_constants_and_build_selection() {
    assert_eq!(DEVNET_GENESIS, b58(DEVNET_GENESIS_B58));
    assert_eq!(MAINNET_GENESIS, b58(MAINNET_GENESIS_B58));
    assert_ne!(DEVNET_GENESIS, MAINNET_GENESIS);
    #[cfg(feature = "mainnet")]
    assert_eq!(CLUSTER_GENESIS, MAINNET_GENESIS);
    #[cfg(not(feature = "mainnet"))]
    assert_eq!(CLUSTER_GENESIS, DEVNET_GENESIS);
    // A vault stamped for one cluster cannot be created under the other build's constant.
    let k = |b: u8| [b; 32];
    assert_eq!(
        Vault::create(k(1), k(2), k(3), k(4), k(5), k(6), k(7), k(8), k(9), DEVNET_GENESIS, &MAINNET_GENESIS).err(),
        Some(PqError::NotDevnet)
    );
    let v = Vault::create(k(1), k(2), k(3), k(4), k(5), k(6), k(7), k(8), k(9), CLUSTER_GENESIS, &CLUSTER_GENESIS).unwrap();
    // Possession leaf is burned at creation; no other leaf is.
    assert!(v.is_consumed(POSSESSION_LEAF));
    assert!((1..LEAVES).all(|l| !v.is_consumed(l)));
}