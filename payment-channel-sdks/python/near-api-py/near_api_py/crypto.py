import json
import os
import random
from dataclasses import dataclass
from pathlib import Path

import base58
from ed25519 import SigningKey, VerifyingKey, create_keypair

from near_api_py.types import AccountId


@dataclass
class Signature:
    signature: bytes


@dataclass
class PublicKey:
    key: VerifyingKey

    def as_string(self) -> str:
        return "ed25519:" + base58.b58encode(self.key.to_bytes()).decode()

    @staticmethod
    def from_string(s: str) -> "PublicKey":
        assert s.startswith("ed25519:"), "Invalid public key"
        return PublicKey(VerifyingKey(base58.b58decode(s[8:])))

    def implicit_account_id(self) -> AccountId:
        return AccountId(self.key.to_bytes().hex())

    def verify(self, signature: Signature, payload: bytes) -> bool:
        return self.key.verify(signature.signature, payload)


@dataclass
class SecretKey:
    key: SigningKey

    def as_string(self) -> str:
        return base58.b58encode(self.key.to_bytes()).decode()

    @staticmethod
    def from_string(s: str) -> "SecretKey":
        return SecretKey(SigningKey(base58.b58decode(s[8:])))

    @staticmethod
    def from_seed(seed=None) -> "SecretKey":
        entropy = os.urandom if seed is None else random.Random(seed).randbytes
        sk, _ = create_keypair(entropy)
        return SecretKey(sk)

    def public_key(self) -> PublicKey:
        return PublicKey(self.key.get_verifying_key())

    def sign(self, payload: bytes) -> Signature:
        return Signature(self.key.sign(payload))


@dataclass
class InMemorySigner:
    account_id: AccountId
    public_key: PublicKey
    secret_key: SecretKey

    def __post_init__(self):
        pk = self.public_key.key
        sk = self.secret_key.key
        assert pk == sk.get_verifying_key()

    @staticmethod
    def implicit_account_from_seed(seed=None) -> "InMemorySigner":
        sk = SecretKey.from_seed(seed)
        pk = sk.public_key()
        account_id = pk.implicit_account_id()
        return InMemorySigner(account_id, pk, sk)

    @staticmethod
    def from_seed(account_id: AccountId, seed=None) -> "InMemorySigner":
        sk = SecretKey.from_seed(seed)
        return InMemorySigner(account_id, sk.public_key(), sk)

    @staticmethod
    def from_secret_key(account_id: AccountId, secret_key: str) -> "InMemorySigner":
        sk = SecretKey.from_string(secret_key)
        return InMemorySigner(account_id, sk.public_key(), sk)

    @staticmethod
    def from_file(path: Path | str):
        path = Path(path).absolute()

        with open(path, "r") as f:
            data = json.load(f)

        account_id = AccountId(data["account_id"])
        public_key = PublicKey.from_string(data["public_key"])
        secret_key = SecretKey.from_string(data["private_key"])

        return InMemorySigner(account_id, public_key, secret_key)
