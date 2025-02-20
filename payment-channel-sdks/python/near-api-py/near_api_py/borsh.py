import dataclasses
import json
import typing as t
from abc import ABC

from construct_typed import DataclassMixin, DataclassStruct

T = t.TypeVar("T", bound=DataclassMixin)


@dataclasses.dataclass
class BorshJsonMixinBase(ABC, DataclassMixin):
    def as_borsh(self) -> bytes:
        self_class = type(self)
        return DataclassStruct(self_class).build(self)

    @classmethod
    def from_borsh(cls: t.Type[T], borsh: bytes) -> T:
        return DataclassStruct(cls).parse(borsh)

    def asdict(self) -> dict:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls: t.Type[T], v: dict) -> T:
        return cls(**v)

    def as_json(self) -> str:
        return json.dumps(self.asdict())

    def as_pretty_json(self) -> str:
        return json.dumps(self.asdict(), indent=2)

    @classmethod
    def from_json(cls: t.Type[T], v: str) -> T:
        return cls.from_dict(json.loads(v))
