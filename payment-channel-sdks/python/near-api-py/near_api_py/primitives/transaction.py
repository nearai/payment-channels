import typing as t

from pydantic import BaseModel

from near_api_py.crypto import PublicKey, Signature
from near_api_py.primitives.action import Action
from near_api_py.primitives.hash import CryptoHash
from near_api_py.primitives.types import Nonce
from near_api_py.types import AccountId


class TransactionV0(BaseModel):
    signer_id: AccountId
    public_key: PublicKey
    nonce: Nonce
    receiver_id: AccountId
    block_hash: CryptoHash
    actions: t.List[Action]


class TransactionV1(BaseModel): ...


Transaction = TransactionV0 | TransactionV1


class SignedTransaction(BaseModel):
    transaction: Transaction
    signature: Signature
    hash: CryptoHash
    size: int
