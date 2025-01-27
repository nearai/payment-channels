from pydantic import BaseModel


class Nonce(BaseModel):
    nonce: int  # u64
