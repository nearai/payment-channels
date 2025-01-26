from pydantic import BaseModel

from .utils.validation import validate_account_id


class AccountId(BaseModel):
    account_id: str

    def model_post_init(self, _ctx):
        assert isinstance(self.account_id, str), "Account id must be a string"
        validate_account_id(self.account_id)

    @staticmethod
    def from_str(value: str) -> "AccountId":
        return AccountId(account_id=value)


class Balance(BaseModel):
    balance: int

    def model_post_init(self, _ctx):
        assert isinstance(self.balance, int)
        assert 0 <= self.balance < 2**128

    @classmethod
    def from_near(cls, value: float | int) -> "Balance":
        """
        Convert an int or float value in NEAR to a Balance in YoctoNEAR.

        The `value` passed in is expected to be in NEAR.
        """
        return cls(balance=int(value * 10**24))

    @classmethod
    def from_yocto_near(cls, value: int | float) -> "Balance":
        """
        Convert a int or float value in YoctoNEAR to a Balance in NEAR.
        """
        return cls(balance=int(value))

    @classmethod
    def from_str(cls, value: str) -> "Balance":
        # Note: Requires parsing the unit (NEAR or YoctoNEAR)
        raise NotImplementedError()


class Gas(BaseModel):
    gas: int

    def model_post_init(self, _ctx):
        assert isinstance(self.gas, int)
        assert 0 <= self.gas < 2**64
