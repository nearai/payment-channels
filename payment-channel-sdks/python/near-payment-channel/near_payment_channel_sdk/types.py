import dataclasses
import typing as t
from abc import ABC

from borsh_construct import U64, U128, Option, String
from construct import Array, Byte
from construct_typed import DataclassMixin, DataclassStruct, TStruct, csfield

DEFAULT_ACCOUNT_ID = "0000000000000000000000000000000000000000000000000000000000000000"
DEFAULT_PUBLIC_KEY = "ed25519:11111111111111111111111111111111"
PREFIX = "ed25519:"

ChannelId = String
AccountId = String
PublicKey = Array(32, Byte)
Signature = Array(64, Byte)

T = t.TypeVar("T", bound=DataclassMixin)

@dataclasses.dataclass
class BorshJsonMixinBase(ABC, DataclassMixin):
    def as_borsh(self) -> bytes:
        self_class = type(self)
        return DataclassStruct(self_class).build(self)

    @classmethod
    def from_borsh(cls: t.Type[T], borsh: bytes) -> T:
        return DataclassStruct(cls).parse(borsh)

    def asdict(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls: t.Type[T], v: dict) -> T:
        return cls(**v)

@dataclasses.dataclass
class Account(BorshJsonMixinBase):
    account_id: str = csfield(AccountId)
    public_key: list[int] = csfield(PublicKey)

@dataclasses.dataclass
class Channel(BorshJsonMixinBase):
    receiver: Account = csfield(TStruct(Account))
    sender: Account = csfield(TStruct(Account))
    added_balance: int = csfield(U128)
    withdrawn_balance: int = csfield(U128)
    force_close_started: int = csfield(Option(U64))

@dataclasses.dataclass
class State(BorshJsonMixinBase):
    channel_id: str = csfield(ChannelId)
    spent_balance: int = csfield(U128)

@dataclasses.dataclass
class SignedState(BorshJsonMixinBase):
    state: State
    signature: list[int] = csfield(Signature)