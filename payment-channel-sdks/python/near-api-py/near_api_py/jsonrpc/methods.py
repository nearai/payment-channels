import typing as t
from abc import abstractmethod
from enum import Enum

from pydantic import BaseModel

from near_api_py.crypto import PublicKey
from near_api_py.types import AccountId


class ViewAccount(BaseModel): ...


class ViewCode(BaseModel): ...


class ViewState(BaseModel): ...


class ViewAccessKey(BaseModel):
    account_id: AccountId
    public_key: PublicKey

    def request_type(self) -> str:
        return "view_access_key"


class ViewAccessKeyList(BaseModel): ...


class CallFunction(BaseModel): ...


QueryRequest = (
    ViewAccount
    | ViewCode
    | ViewState
    | ViewAccessKey
    | ViewAccessKeyList
    | CallFunction
)


class BlockId(BaseModel): ...


class Finality(str, Enum):
    Optimistic = "optimistic"
    Doomslug = "near-final"
    Final = "final"


class SyncCheckpoint(BaseModel): ...


BlockReference = BlockId | Finality | SyncCheckpoint


class RpcMethod(BaseModel):
    @abstractmethod
    def params_json(self) -> t.Any: ...

    @abstractmethod
    def method(self) -> str: ...

    def request_payload(self) -> t.Dict[str, t.Any]:
        return {
            "jsonrpc": "2.0",
            "id": "idontcare",
            "method": self.method(),
            "params": self.params_json(),
        }


class RpcBroadcastTxAsyncRequest(RpcMethod): ...


class RpcQueryRequest(RpcMethod):
    block_reference: BlockReference
    request: QueryRequest

    def method(self) -> str:
        return "query"

    def params_json(self) -> t.Any:
        params = self.request.model_dump()
        params["request_type"] = self.request.request_type()
        params["finality"] = self.block_reference.value
        return params


class RpcResponse: ...
