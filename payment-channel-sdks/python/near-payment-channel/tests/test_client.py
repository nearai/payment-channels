import pytest
from near_api_py.crypto import InMemorySigner
from near_api_py.provider import NEAR_TESTNET_RPC_URL
from near_api_py.types import Balance
from near_payment_channel.client import CONTRACT_ACCOUNT_ID_TESTNET, Client
from near_payment_channel.types import Account


@pytest.fixture
def sender_signer() -> InMemorySigner:
    return InMemorySigner.from_file("tests/etc/payment-channel-tester.testnet.json")


@pytest.fixture
def receiver_signer() -> InMemorySigner:
    return InMemorySigner.implicit_account_from_seed("payment-channel-receiver-account")


@pytest.fixture
def receiver_account(receiver_signer: InMemorySigner) -> Account:
    return Account.from_signer(receiver_signer)


@pytest.fixture
def client(sender_signer: InMemorySigner) -> Client:
    return Client(
        signer=sender_signer,
        rpc_url=NEAR_TESTNET_RPC_URL,
        contract_account_id=CONTRACT_ACCOUNT_ID_TESTNET,
    )


@pytest.mark.asyncio
async def test_open_channel(client: Client, receiver_account: Account):
    await client.open_channel(
        receiver=receiver_account,
        balance=Balance.from_near(0.000314592),
    )
