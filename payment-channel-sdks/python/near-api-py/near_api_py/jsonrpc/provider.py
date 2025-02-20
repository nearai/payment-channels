import httpx
import json
from .methods import RpcMethod, RpcResponse

NEAR_MAINNET_RPC_URL = "https://rpc.mainnet.near.org"
NEAR_TESTNET_RPC_URL = "https://rpc.testnet.near.org"
NEAR_MAINNET_ARCHIVAL_RPC_URL = "https://archival-rpc.mainnet.near.org"
NEAR_TESTNET_ARCHIVAL_RPC_URL = "https://archival-rpc.testnet.near.org"


class JsonRpcProvider:
    def __init__(self, rpc_url: str):
        self.client = httpx.AsyncClient(
            base_url=rpc_url,
            headers={"Content-Type": "application/json"},
        )

    async def call(self, method: RpcMethod) -> RpcResponse:
        request_payload = method.request_payload()
        print(">>", json.dumps(request_payload, indent=2))

        response = await self.client.post(
            "/", headers={"Content-Type": "application/json"}, json=request_payload
        )
        response.raise_for_status()
        response_json = response.json()
        print(response_json)
        return RpcResponse.model_validate_json(response_json)
