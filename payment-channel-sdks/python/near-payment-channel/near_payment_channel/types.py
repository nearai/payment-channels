from near_api_py.crypto import InMemorySigner, PublicKey, SecretKey, Signature
from near_api_py.types import AccountId, Balance
from pydantic import BaseModel

ChannelId = str


class Account(BaseModel):
    """
    Details about a payment channel participant.
    """

    account_id: AccountId
    public_key: PublicKey

    @staticmethod
    def from_signer(signer: InMemorySigner) -> "Account":
        return Account(account_id=signer.account_id, public_key=signer.public_key)


class Channel(BaseModel):
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


class State(BaseModel):
    """
    Payment channel update state information.

    This payload contains the details about how to update a channel.
    """

    channel_id: ChannelId
    spent_balance: Balance


class SignedState(BaseModel):
    """
    A signed state payload.

    This is enough information to update the channel onchain.
    """

    state: State
    signature: Signature

    def verify(self, public_key: PublicKey) -> bool:
        payload = self.state.as_borsh()
        return public_key.verify(self.signature, payload)
