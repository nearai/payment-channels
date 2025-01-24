import requests

NEAR_MAINNET_RPC_URL = "https://rpc.mainnet.near.org"
NEAR_TESTNET_RPC_URL = "https://rpc.testnet.near.org"
NEAR_MAINNET_ARCHIVAL_RPC_URL = "https://archival-rpc.mainnet.near.org"
NEAR_TESTNET_ARCHIVAL_RPC_URL = "https://archival-rpc.testnet.near.org"


class JsonRpcProvider:
    def __init__(self, rpc_url: str):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.rpc_url = rpc_url
