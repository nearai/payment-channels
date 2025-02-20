import json
import typing as t

from near_api_py.crypto import InMemorySigner, SecretKey
from near_api_py.jsonrpc.methods import Finality, RpcQueryRequest, ViewAccessKey
from near_api_py.jsonrpc.provider import NEAR_MAINNET_RPC_URL, JsonRpcProvider
from near_api_py.primitives.action import FunctionCall
from near_api_py.primitives.transaction import TransactionV0
from near_api_py.types import AccountId, Balance, Gas

from .storage import ChannelStorage
from .types import Account, Channel, ChannelId, SignedState

CONTRACT_ACCOUNT_ID_MAINNET = "paymentchannel.near"
CONTRACT_ACCOUNT_ID_TESTNET = "paymentchannel.testnet"


class Client:
    def __init__(
        self,
        *,
        signer: InMemorySigner | None = None,
        storage: ChannelStorage | None = None,
        rpc_url: str = NEAR_MAINNET_RPC_URL,
        contract_account_id: AccountId = CONTRACT_ACCOUNT_ID_MAINNET,
    ):
        self.provider = JsonRpcProvider(rpc_url)
        self.signer = signer
        self.contract_account_id = contract_account_id

        if storage is None:
            self.storage = ChannelStorage()
        else:
            self.storage = storage

    # Note: Consider contributing this method to near-api-py
    async def call(
        self,
        contract: AccountId,
        method: str,
        args: t.Any,
        gas: Gas,
        deposit: Balance,
    ):
        # TODO: Fetch nonce
        result = await self.provider.call(
            RpcQueryRequest(
                block_reference=Finality.Final,
                request=ViewAccessKey(
                    account_id=self.signer.account_id, public_key=self.signer.public_key
                ),
            )
        )

        print(result)
        assert False

        nonce = None
        block_hash = None

        transaction = TransactionV0(
            signer_id=self.signer.account_id,
            public_key=self.signer.public_key,
            nonce=nonce,
            receiver_id=self.contract_account_id,
            block_hash=block_hash,
            actions=[
                FunctionCall(
                    method_name=method,
                    args=json.dumps(args).encode(),
                    gas=gas,
                    deposit=deposit,
                )
            ],
        )

    async def open_channel(self, *, receiver: Account, balance: Balance):
        assert isinstance(self.signer, InMemorySigner)

        # Generate a new secret key to be used by the sender
        sender_sk = SecretKey.from_seed()

        channel = self.storage.create_channel(
            receiver=receiver,
            sender=self.signer.account_id,
            sender_secret_key=sender_sk,
            balance=balance,
        )

        await self.call(
            self.contract_account_id,
            "open_channel",
            dict(
                channel_id=channel.channel_id,
                receiver=channel.receiver.model_dump(),
                sender=channel.sender.model_dump(),
            ),
            gas=Gas.from_tera_gas(40),
            deposit=balance,
        )

    def close_channel(self, state: SignedState):
        raise NotImplementedError()

    def start_force_close_channel(self, channel_id: ChannelId):
        raise NotImplementedError()

    def finish_force_close_channel(self, channel_id: ChannelId):
        raise NotImplementedError()

    def topup(self, channel_id: ChannelId, balance: Balance):
        raise NotImplementedError()

    def create_payment(self, channel_id: ChannelId, balance: Balance) -> SignedState:
        raise NotImplementedError()

    def withdraw(self, channel_id: ChannelId, payment: SignedState):
        raise NotImplementedError()

    def get_channel(self, channel_id: ChannelId, update: bool = False) -> Channel:
        raise NotImplementedError()

    def list_channels(self) -> t.List[Channel]:
        raise NotImplementedError()
