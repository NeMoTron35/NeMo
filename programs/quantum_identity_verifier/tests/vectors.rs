use quantum_identity_verifier::*;
use serde_json::Value;

const G: &str = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
fn load() -> (Value, Vec<u8>, [u8; 32], [u8; 32]) {
    let v: Value = serde_json::from_str(include_str!("vector-v1.json")).unwrap();
    let p = hex::decode(v["proofHex"].as_str().unwrap()).unwrap();
    let r: [u8; 32] = hex::decode(v["root"].as_str().unwrap()).unwrap().try_into().unwrap();
    let s: [u8; 32] = hex::decode(v["publicSeed"].as_str().unwrap()).unwrap().try_into().unwrap();
    (v, p, r, s)
}
fn intent(v: &Value) -> (String, String, String, String, i64) {
    let i = &v["intent"];
    let s = |k: &str| i[k].as_str().unwrap().to_string();
    (s("wallet"), s("target"), s("action"), s("nonce"), i["expiresAt"].as_i64().unwrap())
}
fn chunks(p: &[u8]) -> Vec<&[u8]> { p.chunks(PROOF_BYTES.div_ceil(3)).collect() }

#[test]
fn ts_vector_verifies_and_message_matches() {
    let (v, p, r, s) = load();
    let (w, t, a, n, e) = intent(&v);
    let it = Intent { wallet: &w, target: &t, action: &a, genesis: G, nonce: &n, expires_at: e };
    assert_eq!(binding_message(&it), v["message"].as_str().unwrap());
    let mut c = Counter(0);
    let d = message_digest(PROOF_DOMAIN, v["message"].as_str().unwrap().as_bytes());
    assert_eq!(root_from_proof(&s, &d, &p, &mut c).unwrap(), r);
    std::println!("sha256 calls for vector: {}", c.0);
    assert!(c.0 <= 67 * 15 + 9);
}

#[test]
fn staged_finalize_and_negatives() {
    let (v, p, r, s) = load();
    let (w, t, a, n, e) = intent(&v);
    let it = Intent { wallet: &w, target: &t, action: &a, genesis: G, nonce: &n, expires_at: e };
    let payer = [9u8; 32];
    let open = || Session::open(payer, r, s, commitment(&p), 1000, 300).unwrap();
    let fill = |ss: &mut Session| for (i, c) in chunks(&p).iter().enumerate() { ss.append(&payer, i, c, 1001).unwrap(); };
    let mut used = Vec::new();
    let mut c = Counter(0);
    let mut ok = open(); fill(&mut ok);
    assert!(ok.append(&payer, 0, &[1], 1001).is_err());
    assert!(ok.finalize(&payer, &it, G, &mut used, 1002, &mut c).is_ok());
    assert_eq!(ok.finalize(&payer, &it, G, &mut used, 1002, &mut c), Err(VerifyError::SessionClosed));
    // replay
    let mut rp = open(); fill(&mut rp);
    assert_eq!(rp.finalize(&payer, &it, G, &mut used, 1002, &mut c), Err(VerifyError::Replay));
    // reorder
    let mut ro = open(); let ch = chunks(&p);
    ro.append(&payer, 0, ch[1], 1001).unwrap(); ro.append(&payer, 1, ch[0], 1001).unwrap(); ro.append(&payer, 2, ch[2], 1001).unwrap();
    assert_eq!(ro.finalize(&payer, &it, G, &mut Vec::new(), 1002, &mut c), Err(VerifyError::CommitmentMismatch));
    // truncation
    let mut tr = open(); tr.append(&payer, 0, ch[0], 1001).unwrap();
    assert_eq!(tr.finalize(&payer, &it, G, &mut Vec::new(), 1002, &mut c), Err(VerifyError::MissingChunks));
    // wrong payer
    let mut wp = open();
    assert_eq!(wp.append(&[1u8; 32], 0, ch[0], 1001), Err(VerifyError::WrongPayer));
    // mismatched intent / genesis / expiry / root
    let bad = Intent { nonce: "8", ..Intent { wallet: &w, target: &t, action: &a, genesis: G, nonce: &n, expires_at: e } };
    let mut mi = open(); fill(&mut mi);
    assert_eq!(mi.finalize(&payer, &bad, G, &mut Vec::new(), 1002, &mut c), Err(VerifyError::RootMismatch));
    let mut gn = open(); fill(&mut gn);
    assert_eq!(gn.finalize(&payer, &it, "mainnet", &mut Vec::new(), 1002, &mut c), Err(VerifyError::WrongGenesis));
    let mut ex = open(); fill(&mut ex);
    assert_eq!(ex.finalize(&payer, &it, G, &mut Vec::new(), 2000, &mut c), Err(VerifyError::Expired));
    let mut wr = Session::open(payer, [0u8; 32], s, commitment(&p), 1000, 300).unwrap(); fill(&mut wr);
    assert_eq!(wr.finalize(&payer, &it, G, &mut Vec::new(), 1002, &mut c), Err(VerifyError::RootMismatch));
    // tampered signature byte (with matching commitment) fails root
    let mut tp = p.clone(); tp[10] ^= 1;
    let mut ts = Session::open(payer, r, s, commitment(&tp), 1000, 300).unwrap();
    for (i, cc) in chunks(&tp).iter().enumerate() { ts.append(&payer, i, cc, 1001).unwrap(); }
    assert_eq!(ts.finalize(&payer, &it, G, &mut Vec::new(), 1002, &mut c), Err(VerifyError::RootMismatch));
    assert_eq!(Session::open(payer, r, s, [0; 32], 0, 901).err(), Some(VerifyError::BadTtl));
    assert_eq!(wp.append(&payer, 3, ch[0], 1001), Err(VerifyError::ChunkIndex));
}
