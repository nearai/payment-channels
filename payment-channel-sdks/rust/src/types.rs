use near_sdk::{near, AccountId, NearToken, PublicKey, Timestamp};
use std::str::FromStr;

const DEFAULT_ACCOUNT_ID: &str = "0000000000000000000000000000000000000000000000000000000000000000";
const DEFAULT_PUBLIC_KEY: &str = "ed25519:11111111111111111111111111111111";
const PREFIX: &str = "ed25519:";

type ChannelId = String;

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Account {
    account_id: AccountId,
    public_key: PublicKey,
}

impl Default for Account {
    fn default() -> Self {
        Self {
            account_id: DEFAULT_ACCOUNT_ID.to_string().try_into().unwrap(),
            public_key: PublicKey::from_str(DEFAULT_PUBLIC_KEY).unwrap(),
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct Channel {
    receiver: Account,
    sender: Account,
    added_balance: NearToken,
    withdrawn_balance: NearToken,
    force_close_started: Option<Timestamp>,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct State {
    channel_id: ChannelId,
    spent_balance: NearToken,
}

#[near(serializers = [borsh, json])]
#[derive(Debug, Clone)]
pub struct SignedState {
    state: State,
    signature: near_crypto::Signature,
}
