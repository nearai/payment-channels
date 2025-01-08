import {
  borshDeserialize,
  BorshSchema,
  borshSerialize,
  type BSE,
  type TypeOf,
} from "./borsher";

import { Buffer } from "buffer";

abstract class BorshSerializable<T extends BSE> {
  abstract schema: BorshSchema<T>;
  value: TypeOf<T>;

  constructor(value: TypeOf<T>) {
    this.value = value;
  }

  to_borsh(): Buffer {
    return borshSerialize(this.schema, this.value);
  }

  from_borsh(buffer: Buffer): void {
    this.value = borshDeserialize(this.schema, buffer);
  }
}

const accountSchema = BorshSchema.Struct({
  account_id: BorshSchema.String,
  public_key: BorshSchema.Array(BorshSchema.u8, 32),
});
type TAccount = typeof accountSchema extends BorshSchema<infer T> ? T : never;
export class Account extends BorshSerializable<TAccount> {
  schema = accountSchema;
}

const channelSchema = BorshSchema.Struct({
  receiver: accountSchema,
  sender: accountSchema,
  added_balance: BorshSchema.u128,
  withdrawn_balance: BorshSchema.u128,
  force_close_started: BorshSchema.Option(BorshSchema.u64),
});
type TChannel = typeof channelSchema extends BorshSchema<infer T> ? T : never;
export class Channel extends BorshSerializable<TChannel> {
  schema = channelSchema;
}

const stateSchema = BorshSchema.Struct({
  channel_id: accountSchema,
  spent_balance: BorshSchema.u128,
});
type TState = typeof stateSchema extends BorshSchema<infer T> ? T : never;
export class State extends BorshSerializable<TState> {
  schema = stateSchema;
}

const signedStateSchema = BorshSchema.Struct({
  state: stateSchema,
  signature: BorshSchema.Array(BorshSchema.u8, 64),
});
type TSignedState =
  typeof signedStateSchema extends BorshSchema<infer T> ? T : never;
export class SignedState extends BorshSerializable<TSignedState> {
  schema = signedStateSchema;
}
