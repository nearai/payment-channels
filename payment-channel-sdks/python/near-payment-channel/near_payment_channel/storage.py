import typing as t
import uuid
from pathlib import Path

from near_api_py.crypto import SecretKey
from near_api_py.types import AccountId, Balance

from .types import Account, Channel, ChannelId, SignedState


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
        sender_secret_key: SecretKey,
        balance: Balance,
    ) -> Channel:
        channel = Channel(
            channel_id=uuid.uuid4().hex,
            receiver=receiver,
            sender=Account(sender, sender_secret_key.public_key()),
            sender_secret_key=sender_secret_key,
            added_balance=balance,
            spent_balance=0,
            force_close_started=None,
        )

        self._save(channel)
        return channel

    def _save(self, channel: Channel):
        self.location.joinpath(f"{channel.channel_id}.json").write_text(
            channel.as_pretty_json()
        )

    def list_channels(self) -> t.List[Channel]:
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
