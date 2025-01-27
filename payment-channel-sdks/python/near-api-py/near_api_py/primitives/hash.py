from pydantic import BaseModel


class CryptoHash(BaseModel):
    hash: bytes

    def model_post_init(self, _ctx):
        assert len(self.hash) == 32
