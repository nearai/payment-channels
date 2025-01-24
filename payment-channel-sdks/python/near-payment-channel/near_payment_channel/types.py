from dataclasses import dataclass

from near_api_py.borsh import BorshJsonMixinBase
from near_api_py.crypto import InMemorySigner, PublicKey, SecretKey, Signature
from near_api_py.types import AccountId, Balance

ChannelId = str


@dataclass
class Account:
    """
    Details about a payment channel participant.
    """

    account_id: AccountId
    public_key: PublicKey

    @staticmethod
    def from_signer(signer: InMemorySigner) -> "Account":
        return Account(signer.account_id, signer.public_key)


@dataclass
class Channel(BorshJsonMixinBase):
    """
    Details about a payment channel.
    """

    channel_id: ChannelId
    receiver: Account
    sender: Account
    sender_secret_key: SecretKey
    spent_balance: Balance
    added_balance: Balance
    force_close_started: int | None


@dataclass
class State(BorshJsonMixinBase):
    """
    Payment channel update state information.

    This payload contains the details about how to update a channel.
    """

    channel_id: ChannelId
    spent_balance: Balance


@dataclass
class SignedState(BorshJsonMixinBase):
    """
    A signed state payload.

    This is enough information to update the channel onchain.
    """

    state: State
    signature: Signature

    def verify(self, public_key: PublicKey) -> bool:
        payload = self.state.as_borsh()
        return public_key.verify(self.signature, payload)
