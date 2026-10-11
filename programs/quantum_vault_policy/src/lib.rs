//! Pure, dependency-free withdrawal policy for Quantum Vault Phase 1.
//! The Anchor program calls `check_withdraw` with on-chain state and the Solana Clock;
//! nothing supplied by a client is treated as authority.
#![forbid(unsafe_code)]

pub const ACCOUNT_VERSION: u8 = 1;
pub const SPEND_WINDOW_SECS: i64 = 86_400;
pub const MAX_INTENT_TTL_SECS: i64 = 600;
pub const UNPAUSE_DELAY_SECS: i64 = 86_400;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Policy {
    pub destination: [u8; 32],
    pub max_per_withdraw: u64,
    pub daily_limit: u64,
    pub unlock_ts: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct State {
    pub window_start: i64,
    pub window_spent: u64,
    pub nonce: u64,
    pub epoch: u32,
    pub paused: bool,
    pub unpause_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Intent {
    pub amount: u64,
    pub destination: [u8; 32],
    pub nonce: u64,
    pub epoch: u32,
    pub expires_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyError {
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
}

pub fn validate_policy(p: &Policy) -> Result<(), PolicyError> {
    if p.max_per_withdraw == 0 || p.daily_limit == 0 || p.max_per_withdraw > p.daily_limit {
        return Err(PolicyError::InvalidPolicy);
    }
    if p.destination == [0u8; 32] || p.unlock_ts < 0 {
        return Err(PolicyError::InvalidPolicy);
    }
    Ok(())
}

/// Returns the next state when the withdrawal is permitted.
pub fn check_withdraw(
    p: &Policy,
    s: &State,
    i: &Intent,
    escrow_balance: u64,
    now: i64,
) -> Result<State, PolicyError> {
    if i.amount == 0 {
        return Err(PolicyError::ZeroAmount);
    }
    if s.paused {
        return Err(PolicyError::Paused);
    }
    if now < p.unlock_ts {
        return Err(PolicyError::Locked);
    }
    if now > i.expires_at {
        return Err(PolicyError::Expired);
    }
    if i.expires_at.checked_sub(now).ok_or(PolicyError::Overflow)? > MAX_INTENT_TTL_SECS {
        return Err(PolicyError::ExpiryTooFar);
    }
    if i.epoch != s.epoch {
        return Err(PolicyError::WrongEpoch);
    }
    if i.nonce != s.nonce {
        return Err(PolicyError::WrongNonce);
    }
    if i.destination != p.destination {
        return Err(PolicyError::WrongDestination);
    }
    if i.amount > p.max_per_withdraw {
        return Err(PolicyError::OverPerWithdraw);
    }
    if i.amount > escrow_balance {
        return Err(PolicyError::InsufficientEscrow);
    }
    let window_end = s.window_start.checked_add(SPEND_WINDOW_SECS).ok_or(PolicyError::Overflow)?;
    let (window_start, spent) = if now >= window_end { (now, 0u64) } else { (s.window_start, s.window_spent) };
    let next_spent = spent.checked_add(i.amount).ok_or(PolicyError::Overflow)?;
    if next_spent > p.daily_limit {
        return Err(PolicyError::OverDailyLimit);
    }
    Ok(State {
        window_start,
        window_spent: next_spent,
        nonce: s.nonce.checked_add(1).ok_or(PolicyError::Overflow)?,
        ..*s
    })
}

pub fn pause(s: &State) -> State {
    State { paused: true, unpause_at: 0, ..*s }
}

pub fn request_unpause(s: &State, now: i64) -> Result<State, PolicyError> {
    if !s.paused {
        return Err(PolicyError::NotPaused);
    }
    Ok(State { unpause_at: now.checked_add(UNPAUSE_DELAY_SECS).ok_or(PolicyError::Overflow)?, ..*s })
}

pub fn unpause(s: &State, now: i64) -> Result<State, PolicyError> {
    if !s.paused {
        return Err(PolicyError::NotPaused);
    }
    if s.unpause_at == 0 {
        return Err(PolicyError::UnpauseNotRequested);
    }
    if now < s.unpause_at {
        return Err(PolicyError::UnpauseDelayActive);
    }
    // Epoch bump invalidates any intent prepared before the pause.
    Ok(State {
        paused: false,
        unpause_at: 0,
        epoch: s.epoch.checked_add(1).ok_or(PolicyError::Overflow)?,
        ..*s
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const DEST: [u8; 32] = [7u8; 32];
    const NOW: i64 = 1_800_000_000;
    fn policy() -> Policy {
        Policy { destination: DEST, max_per_withdraw: 100, daily_limit: 250, unlock_ts: NOW - 10 }
    }
    fn state() -> State {
        State { window_start: NOW - 100, window_spent: 0, nonce: 0, epoch: 0, paused: false, unpause_at: 0 }
    }
    fn intent(amount: u64, nonce: u64) -> Intent {
        Intent { amount, destination: DEST, nonce, epoch: 0, expires_at: NOW + 60 }
    }

    #[test]
    fn valid_withdraw_advances_nonce_and_spend() {
        let s = check_withdraw(&policy(), &state(), &intent(100, 0), 1_000, NOW).unwrap();
        assert_eq!((s.nonce, s.window_spent), (1, 100));
    }
    #[test]
    fn rejects_invalid_policies() {
        assert_eq!(validate_policy(&Policy { max_per_withdraw: 0, ..policy() }), Err(PolicyError::InvalidPolicy));
        assert_eq!(validate_policy(&Policy { max_per_withdraw: 300, ..policy() }), Err(PolicyError::InvalidPolicy));
        assert_eq!(validate_policy(&Policy { destination: [0; 32], ..policy() }), Err(PolicyError::InvalidPolicy));
        assert!(validate_policy(&policy()).is_ok());
    }
    #[test]
    fn rejects_zero_wrong_recipient_and_over_limit() {
        let (p, s) = (policy(), state());
        assert_eq!(check_withdraw(&p, &s, &intent(0, 0), 1_000, NOW), Err(PolicyError::ZeroAmount));
        let wrong = Intent { destination: [8; 32], ..intent(10, 0) };
        assert_eq!(check_withdraw(&p, &s, &wrong, 1_000, NOW), Err(PolicyError::WrongDestination));
        assert_eq!(check_withdraw(&p, &s, &intent(101, 0), 1_000, NOW), Err(PolicyError::OverPerWithdraw));
        assert_eq!(check_withdraw(&p, &s, &intent(50, 0), 40, NOW), Err(PolicyError::InsufficientEscrow));
    }
    #[test]
    fn nonce_reuse_and_replay_fail() {
        let p = policy();
        let s1 = check_withdraw(&p, &state(), &intent(10, 0), 1_000, NOW).unwrap();
        assert_eq!(check_withdraw(&p, &s1, &intent(10, 0), 1_000, NOW), Err(PolicyError::WrongNonce));
        assert_eq!(check_withdraw(&p, &s1, &intent(10, 5), 1_000, NOW), Err(PolicyError::WrongNonce));
        let old_epoch = Intent { epoch: 0, ..intent(10, 1) };
        let s_e = State { epoch: 1, ..s1 };
        assert_eq!(check_withdraw(&p, &s_e, &old_epoch, 1_000, NOW), Err(PolicyError::WrongEpoch));
    }
    #[test]
    fn daily_window_accumulates_and_resets_at_boundary() {
        let p = policy();
        let mut s = state();
        s = check_withdraw(&p, &s, &intent(100, 0), 1_000, NOW).unwrap();
        s = check_withdraw(&p, &s, &intent(100, 1), 1_000, NOW).unwrap();
        assert_eq!(check_withdraw(&p, &s, &intent(51, 2), 1_000, NOW), Err(PolicyError::OverDailyLimit));
        let end = s.window_start + SPEND_WINDOW_SECS;
        let just_before = Intent { expires_at: end - 1 + 60, ..intent(51, 2) };
        assert_eq!(check_withdraw(&p, &s, &just_before, 1_000, end - 1), Err(PolicyError::OverDailyLimit));
        let at = Intent { expires_at: end + 60, ..intent(51, 2) };
        let r = check_withdraw(&p, &s, &at, 1_000, end).unwrap();
        assert_eq!((r.window_start, r.window_spent), (end, 51));
    }
    #[test]
    fn expiry_and_timelock_boundaries() {
        let p = policy();
        let s = state();
        assert!(check_withdraw(&p, &s, &intent(1, 0), 1_000, NOW + 60).is_ok());
        assert_eq!(check_withdraw(&p, &s, &intent(1, 0), 1_000, NOW + 61), Err(PolicyError::Expired));
        let far = Intent { expires_at: NOW + MAX_INTENT_TTL_SECS + 1, ..intent(1, 0) };
        assert_eq!(check_withdraw(&p, &s, &far, 1_000, NOW), Err(PolicyError::ExpiryTooFar));
        let locked = Policy { unlock_ts: NOW + 1, ..p };
        assert_eq!(check_withdraw(&locked, &s, &intent(1, 0), 1_000, NOW), Err(PolicyError::Locked));
    }
    #[test]
    fn pause_is_immediate_and_unpause_is_delayed() {
        let p = policy();
        let s = pause(&state());
        assert_eq!(check_withdraw(&p, &s, &intent(1, 0), 1_000, NOW), Err(PolicyError::Paused));
        assert_eq!(unpause(&s, NOW), Err(PolicyError::UnpauseNotRequested));
        let r = request_unpause(&s, NOW).unwrap();
        assert_eq!(unpause(&r, NOW + UNPAUSE_DELAY_SECS - 1), Err(PolicyError::UnpauseDelayActive));
        let u = unpause(&r, NOW + UNPAUSE_DELAY_SECS).unwrap();
        assert_eq!(u.epoch, 1);
        // intent prepared under the old epoch is now rejected
        let later = Intent { expires_at: NOW + UNPAUSE_DELAY_SECS + 60, ..intent(1, 0) };
        assert_eq!(check_withdraw(&p, &u, &later, 1_000, NOW + UNPAUSE_DELAY_SECS), Err(PolicyError::WrongEpoch));
        // re-pausing cancels a pending unpause request
        assert_eq!(pause(&r).unpause_at, 0);
    }
    #[test]
    fn overflow_is_checked() {
        let p = Policy { max_per_withdraw: u64::MAX, daily_limit: u64::MAX, ..policy() };
        let s = State { window_spent: u64::MAX - 1, ..state() };
        assert_eq!(check_withdraw(&p, &s, &intent(2, 0), u64::MAX, NOW), Err(PolicyError::Overflow));
        let n = State { nonce: u64::MAX, ..state() };
        assert_eq!(check_withdraw(&policy(), &n, &intent(1, u64::MAX), 1_000, NOW), Err(PolicyError::Overflow));
    }
}