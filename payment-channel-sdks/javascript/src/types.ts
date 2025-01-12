import { validateAccountId } from "near-sdk-js";
import {
  borshDeserialize,
  BorshSchema,
  borshSerialize,
  type BSE,
  type TypeOf,
} from "./borsher";

import { Buffer } from "buffer";
import { z } from "zod";

const YOCTO_NEAR_PER_NEAR = 10 ** 24;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AccountId = string;
export type ChannelId = string;

export class NearToken {
  private yoctoNear: bigint;

  constructor(yoctoNear: bigint) {
    if (yoctoNear < 0n) {
      throw new Error("NearToken amount cannot be negative");
    }
    this.yoctoNear = yoctoNear;
  }

  as_yocto_near(): bigint {
    return this.yoctoNear;
  }

  as_near(): number {
    return Number(this.yoctoNear) / YOCTO_NEAR_PER_NEAR;
  }

  static parse_yocto_near(yoctoNear: string | bigint): NearToken {
    try {
      const yoctoNearNumber = BigInt(yoctoNear);
      return new NearToken(yoctoNearNumber);
    } catch (e) {
      throw new Error(`Invalid yoctoNEAR amount: ${yoctoNear}`);
    }
  }

  static parse_near(near: string | number): NearToken {
    if (near === "" || near === null || near === undefined) {
      throw new Error("NEAR amount cannot be empty");
    }

    const nearNum = Number(near);
    return NearToken.parse_yocto_near(BigInt(nearNum * YOCTO_NEAR_PER_NEAR));
  }
}

type Equal<T, U> = T extends U
  ? U extends T
    ? T
    : "Types are not equal"
  : "Types are not equal";

abstract class Schemable<T extends BSE> {
  abstract borshSchema: BorshSchema<T>;
  abstract zodSchema: z.ZodTypeAny;
  value: TypeOf<T>;

  constructor(value: TypeOf<T>) {
    this.value = value;
  }

  to_borsh(): Buffer {
    return borshSerialize(this.borshSchema, this.value);
  }

  from_borsh(buffer: Buffer): void {
    this.value = borshDeserialize(this.borshSchema, buffer);
  }
}

// Account schema
const accountSchema = BorshSchema.Struct({
  account_id: BorshSchema.String,
  public_key: BorshSchema.String,
});
type BorshAccount =
  typeof accountSchema extends BorshSchema<infer T> ? T : never;
const accountZodSchema = z.object({
  account_id: z.string(),
  public_key: z.string(),
});
export type AccountType = Equal<
  TypeOf<BorshAccount>,
  z.infer<typeof accountZodSchema>
>;
export class Account extends Schemable<BorshAccount> {
  static borshSchema = accountSchema;
  static zodSchema = accountZodSchema;

  borshSchema = Account.borshSchema;
  zodSchema = Account.zodSchema;

  constructor(value: TypeOf<BorshAccount>) {
    if (!validateAccountId(value.account_id)) {
      throw new Error(`Invalid account ID: ${value.account_id}`);
    }
    super(value);
  }

  static parse(value: unknown): Account {
    return new Account(accountZodSchema.parse(value));
  }
}

// Channel schema
const channelBorshSchema = BorshSchema.Struct({
  receiver: accountSchema,
  sender: accountSchema,
  added_balance: BorshSchema.u128,
  withdrawn_balance: BorshSchema.u128,
  force_close_started: BorshSchema.Option(BorshSchema.u64),
});
type BorshChannel =
  typeof channelBorshSchema extends BorshSchema<infer T> ? T : never;
const channelZodSchema = z.object({
  receiver: accountZodSchema,
  sender: accountZodSchema,
  added_balance: z.preprocess((val: unknown) => {
    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "bigint"
    ) {
      return BigInt(val);
    }
    return val;
  }, z.bigint()),
  withdrawn_balance: z.preprocess((val: unknown) => {
    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "bigint"
    ) {
      return BigInt(val);
    }
    return val;
  }, z.bigint()),
  force_close_started: z
    .preprocess((val: unknown) => {
      if (val === null) return null;
      if (
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "bigint"
      ) {
        return BigInt(val);
      }
      return val;
    }, z.bigint())
    .nullable(),
});
export type ChannelType = Equal<
  TypeOf<BorshChannel>,
  z.infer<typeof channelZodSchema>
>;
export class Channel extends Schemable<BorshChannel> {
  static borshSchema = channelBorshSchema;
  static zodSchema = channelZodSchema;

  borshSchema = Channel.borshSchema;
  zodSchema = Channel.zodSchema;

  constructor(value: ChannelType) {
    if (!validateAccountId(value.receiver.account_id)) {
      throw new Error(
        `Invalid receiver account ID: ${value.receiver.account_id}`
      );
    }
    if (!validateAccountId(value.sender.account_id)) {
      throw new Error(`Invalid sender account ID: ${value.sender.account_id}`);
    }
    super(value);
  }

  static parse(value: unknown): Channel {
    return new Channel(Channel.zodSchema.parse(value));
  }
}

export interface ChannelEntry {
  id: ChannelId;
  channel: ChannelType;
}

// State schema
const stateSchema = BorshSchema.Struct({
  channel_id: BorshSchema.String,
  spent_balance: BorshSchema.u128,
});
type BorshState = typeof stateSchema extends BorshSchema<infer T> ? T : never;
type BorshStateTypeOf = TypeOf<BorshState>;
const stateZodSchema = z.object({
  channel_id: z.string(),
  spent_balance: z.bigint(),
});
type StateZodSchemaType = z.infer<typeof stateZodSchema>;
export type StateType = Equal<BorshStateTypeOf, StateZodSchemaType>;
export class State extends Schemable<BorshState> {
  static borshSchema = stateSchema;
  static zodSchema = stateZodSchema;

  borshSchema = State.borshSchema;
  zodSchema = State.zodSchema;

  constructor(value: BorshStateTypeOf) {
    super(value);
  }

  static parse(value: unknown): State {
    return new State(stateZodSchema.parse(value));
  }
}

// Signed state schema
const signedStateSchema = BorshSchema.Struct({
  state: stateSchema,
  signature: BorshSchema.Array(BorshSchema.u8, 64),
});
type BorshSignedState =
  typeof signedStateSchema extends BorshSchema<infer T> ? T : never;
type BorshSignedStateTypeOf = TypeOf<BorshSignedState>;
const signedStateZodSchema = z.object({
  state: stateZodSchema,
  signature: z.array(z.number()).length(64),
});
type SignedStateZodSchemaType = z.infer<typeof signedStateZodSchema>;
export type SignedStateType = Equal<
  BorshSignedStateTypeOf,
  SignedStateZodSchemaType
>;
export class SignedState extends Schemable<BorshSignedState> {
  static borshSchema = signedStateSchema;
  static zodSchema = signedStateZodSchema;

  borshSchema = SignedState.borshSchema;
  zodSchema = SignedState.zodSchema;

  constructor(value: BorshSignedStateTypeOf) {
    super(value);
  }

  static parse(value: unknown): SignedState {
    return new SignedState(signedStateZodSchema.parse(value));
  }
}
