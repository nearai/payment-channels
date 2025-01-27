from pydantic import BaseModel

from near_api_py.types import Balance, Gas


class CreateAccount(BaseModel): ...


class DeployContract(BaseModel): ...


class FunctionCall(BaseModel):
    method_name: str
    args: bytes
    gas: Gas
    deposit: Balance


class Transfer(BaseModel): ...


class Stake(BaseModel): ...


class AddKey(BaseModel): ...


class DeleteKey(BaseModel): ...


class DeleteAccount(BaseModel): ...


class Delegate(BaseModel): ...


class NonrefundableStorageTransfer(BaseModel): ...


Action = (
    CreateAccount
    | DeployContract
    | FunctionCall
    | Transfer
    | Stake
    | AddKey
    | DeleteKey
    | DeleteAccount
    | Delegate
    | NonrefundableStorageTransfer
)
