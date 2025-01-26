import json
import os
import random
import typing as t
from pathlib import Path

import base58
from ed25519 import SigningKey, VerifyingKey, create_keypair
from pydantic import BaseModel, ConfigDict, field_serializer, field_validator

from near_api_py.types import AccountId


def _serialize(payload: bytes) -> str:
    return "ed25519:" + base58.b58encode(payload).decode()


def _deserialize(data: str) -> bytes:
    assert data.startswith("ed25519:"), "Invalid signature"
    return base58.b58decode(data[8:])


class Signature(BaseModel):
    signature: bytes

    @field_serializer("signature")
    def serialize_signature(cls, v: bytes) -> str:
        return _serialize(v)

    @field_validator("signature", mode="before")
    def validate_signature(cls, value: t.Any) -> bytes:
        if isinstance(value, str):
            return _deserialize(value)
        elif isinstance(value, bytes):
            return value
        else:
            raise ValueError("Invalid signature. Expected a string or bytes.")


class PublicKey(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    key: VerifyingKey

    @field_serializer("key")
    @classmethod
    def serialize_key(cls, v: VerifyingKey) -> str:
        return _serialize(v.to_bytes())

    @field_validator("key", mode="before")
    @classmethod
    def validate_key(cls, value: t.Any) -> VerifyingKey:
        if isinstance(value, str):
            return VerifyingKey(_deserialize(value))
        elif isinstance(value, bytes):
            return VerifyingKey(value)
        elif isinstance(value, VerifyingKey):
            return value
        else:
            raise ValueError("Invalid public key. Expected string or bytes.")

    def implicit_account_id(self) -> AccountId:
        return AccountId.from_str(self.key.to_bytes().hex())

    def verify(self, signature: Signature, payload: bytes) -> bool:
        return self.key.verify(signature.signature, payload)


class SecretKey(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    key: SigningKey

    @field_serializer("key")
    @classmethod
    def serialize_key(cls, v: SigningKey) -> str:
        return _serialize(v.to_bytes())

    @field_validator("key", mode="before")
    @classmethod
    def validate_key(cls, value: t.Any) -> SigningKey:
        if isinstance(value, str):
            return SigningKey(_deserialize(value))
        elif isinstance(value, bytes):
            return SigningKey(value)
        elif isinstance(value, SigningKey):
            return value
        else:
            raise ValueError("Invalid secret key. Expected a string or bytes.")

    @staticmethod
    def from_seed(seed=None) -> "SecretKey":
        entropy = os.urandom if seed is None else random.Random(seed).randbytes
        sk, _ = create_keypair(entropy)
        return SecretKey(key=sk)

    def public_key(self) -> PublicKey:
        return PublicKey(key=self.key.get_verifying_key())

    def sign(self, payload: bytes) -> Signature:
        return Signature(signature=self.key.sign(payload))


class InMemorySigner(BaseModel):
    account_id: AccountId
    public_key: PublicKey
    secret_key: SecretKey

    def model_post_init(self, _ctx):
        pk = self.public_key.key
        sk = self.secret_key.key
        assert pk == sk.get_verifying_key()

    @staticmethod
    def implicit_account_from_seed(seed=None) -> "InMemorySigner":
        sk = SecretKey.from_seed(seed)
        pk = sk.public_key()
        account_id = pk.implicit_account_id()
        return InMemorySigner(account_id=account_id, public_key=pk, secret_key=sk)

    @staticmethod
    def from_seed(account_id: AccountId, seed=None) -> "InMemorySigner":
        sk = SecretKey.from_seed(seed)
        return InMemorySigner(
            account_id=account_id,
            public_key=sk.public_key(),
            secret_key=sk,
        )

    @staticmethod
    def from_secret_key(account_id: AccountId, secret_key: str) -> "InMemorySigner":
        sk = SecretKey.from_string(secret_key)
        return InMemorySigner(
            account_id=account_id,
            public_key=sk.public_key(),
            secret_key=sk,
        )

    @staticmethod
    def from_file(path: Path | str):
        path = Path(path).absolute()

        with open(path, "r") as f:
            data = json.load(f)

        account_id = AccountId.from_str(data["account_id"])
        public_key = PublicKey(key=data["public_key"])
        secret_key = SecretKey(key=data["private_key"])

        return InMemorySigner(
            account_id=account_id,
            public_key=public_key,
            secret_key=secret_key,
        )
