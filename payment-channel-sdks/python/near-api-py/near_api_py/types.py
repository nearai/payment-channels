from dataclasses import dataclass

from .utils.validation import validate_account_id


@dataclass
class AccountId:
    account_id: str

    def __post_init__(self):
        assert isinstance(self.account_id, str), "Account id must be a string"
        validate_account_id(self.account_id)


@dataclass
class Balance:
    balance: int

    def __post_init__(self):
        assert isinstance(self.balance, int)
        assert 0 <= self.balance < 2**128

    @classmethod
    def from_near(cls, value: float | int) -> "Balance":
        """
        Convert an int or float value in NEAR to a Balance in YoctoNEAR.

        The `value` passed in is expected to be in NEAR.
        """
        return cls(int(value * 10**24))

    @classmethod
    def from_yocto_near(cls, value: int | float) -> "Balance":
        """
        Convert a int or float value in YoctoNEAR to a Balance in NEAR.
        """
        return cls(int(value))

    @classmethod
    def from_str(cls, value: str) -> "Balance":
        # Note: Requires parsing the unit (NEAR or YoctoNEAR)
        raise NotImplementedError()


@dataclass
class Gas:
    gas: int

    def __post_init__(self):
        assert isinstance(self.gas, int)
        assert 0 <= self.gas < 2**64
