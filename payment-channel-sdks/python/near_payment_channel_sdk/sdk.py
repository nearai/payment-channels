import uuid
from pathlib import Path
from typing import List

import ed25519
from py_near.account import Account as Signer
from py_near.providers import JsonProvider

from .types import Account, AccountId, Channel, ChannelId, SignedState, State


class Client:
    def __init__(
        self,
        *,
        signer: Signer | None = None,
        storage: "ChannelStorage" | None = None,
        rpc_addr: str = "https://rpc.mainnet.near.org",
        contract_account_id: AccountId = "payment_channel.near",
    ):
        self.provider = JsonProvider(rpc_addr)
        self.signer = signer
        self.contract_account_id = contract_account_id

        if storage is None:
            self.storage = ChannelStorage()
        else:
            self.storage = storage

    async def open_channel(self, *, receiver: Account, amount: int = 0):
        assert isinstance(self.signer, Signer)
        private_key, public_key = ed25519.create_keypair()
        private_key_b = private_key.to_bytes()[:32]
        public_key_b = public_key.to_bytes()

        channel = self.storage.create_channel(
            receiver,
            self.signer.account_id,
            private_key_b,
            public_key_b,
        )

        # TODO: Send transaction to open the channel
        raise NotImplementedError()

    def close_channel(self, state: SignedState):
        raise NotImplementedError()

    def start_force_close_channel(self, channel_id: ChannelId):
        raise NotImplementedError()

    def finish_force_close_channel(self, channel_id: ChannelId):
        raise NotImplementedError()

    def topup(self, channel_id: ChannelId, amount: int):
        raise NotImplementedError()

    def create_payment(self, channel_id: ChannelId, amount: int) -> SignedState:
        raise NotImplementedError()

    def withdraw(self, channel_id: ChannelId, payment: SignedState):
        raise NotImplementedError()

    def get_channel(self, channel_id: ChannelId, update: bool = False) -> Channel:
        raise NotImplementedError()

    def list_channels(self) -> List[Channel]:
        raise NotImplementedError()


class ChannelStorage:
    def __init__(self, location: str | Path | None = None):
        if location is None:
            location = Path.home() / ".near-payment-channel"

        self.location = Path(location)
        self.location.mkdir(parents=True, exist_ok=True)

    def create_channel(
        self,
        receiver: Account,
        sender: AccountId,
        private_key: bytes,
        public_key: bytes,
        amount: int = 0,
    ) -> Channel:
        channel = Channel(
            channel_id=uuid.uuid4().hex,
            receiver=receiver,
            sender=Account(sender, public_key),
            private_key=private_key,
            added_balance=amount,
            spent_balance=0,
            force_close_started=None,
        )

        self._save(channel)
        return channel

    def _save(self, channel: Channel):
        self.location.joinpath(f"{channel.channel_id}.json").write_text(
            channel.as_pretty_json()
        )

    def list_channels(self) -> List[Channel]:
        return [
            Channel.from_json(f.read_text())
            for f in self.location.glob("*.json")
            if f.is_file()
        ]

    def load_channel(self, channel_id: ChannelId) -> Channel | None:
        path = self.location.joinpath(f"{channel_id}.json")
        if not path.is_file():
            return None
        return Channel.from_json(path.read_text())

    def update_channel(self, state: SignedState):
        channel = self.load_channel(state.channel_id)

        assert isinstance(channel, Channel)
        assert state.verify(channel.sender.public_key)

        channel.spent_balance = state.state.spent_balance
        self._save(channel)
