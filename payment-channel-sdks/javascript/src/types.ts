import { validateAccountId } from "near-sdk-js";
import { BorshSchema, borshSerialize, type BSE, type TypeOf } from "./borsher";

import { Buffer } from "buffer";
import { z } from "zod";

const YOCTO_NEAR_PER_NEAR = 10 ** 24;

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AccountId = string;
export type ChannelId = string;

const bigIntPreprocess = (val: unknown) => {
  if (
    typeof val === "bigint" ||
    typeof val === "boolean" ||
    typeof val === "number" ||
    typeof val === "string"
  ) {
    return BigInt(val);
  }
  return val;
};

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

type Equal<T, U> = T extends U ? (U extends T ? T : never) : never;

abstract class Schemable<T extends BSE, S extends z.AnyZodObject> {
  abstract borshSchema: BorshSchema<T>;
  abstract zodSchema: S;
  value: TypeOf<T>;

  constructor(value: TypeOf<T>) {
    this.value = value;
  }

  to_borsh(): Buffer {
    return borshSerialize(this.borshSchema, this.value);
  }

  to_json(): string {
    return JSON.stringify(
      this.value,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    );
  }
}

// Account schema
const accountSchema = BorshSchema.Struct({
  account_id: BorshSchema.String,
  public_key: BorshSchema.String,
});
type BorshAccount =
  typeof accountSchema extends BorshSchema<infer T> ? T : never;
type BorshAccountTypeOf = TypeOf<BorshAccount>;

const accountZodSchema = z.object({
  account_id: z.string(),
  public_key: z.string(),
});
type AccountZodSchemaType = z.infer<typeof accountZodSchema>;
export type AccountType = Equal<BorshAccountTypeOf, AccountZodSchemaType>;

export class Account extends Schemable<BorshAccount, typeof accountZodSchema> {
  static borshSchema = accountSchema;
  static zodSchema = accountZodSchema;

  borshSchema = accountSchema;
  zodSchema = accountZodSchema;

  constructor(value: AccountType) {
    if (!validateAccountId(value.account_id)) {
      throw new Error(`Invalid account ID: ${value.account_id}`);
    }
    super(value);
  }

  static parse(value: unknown): Account {
    return new Account(Account.zodSchema.parse(value));
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
type BorshChannelTypeOf = TypeOf<BorshChannel>;

const channelZodSchema = z.object({
  receiver: accountZodSchema,
  sender: accountZodSchema,
  added_balance: z.preprocess(bigIntPreprocess, z.bigint()),
  withdrawn_balance: z.preprocess(bigIntPreprocess, z.bigint()),
  force_close_started: z.preprocess(bigIntPreprocess, z.bigint()).nullable(),
});
type ChannelZodSchemaType = z.infer<typeof channelZodSchema>;
export type ChannelType = Equal<BorshChannelTypeOf, ChannelZodSchemaType>;

export class Channel extends Schemable<BorshChannel, typeof channelZodSchema> {
  static borshSchema = channelBorshSchema;
  static zodSchema = channelZodSchema;

  borshSchema = channelBorshSchema;
  zodSchema = channelZodSchema;

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

  static parse(value: ChannelType): Channel {
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

export class State extends Schemable<BorshState, typeof stateZodSchema> {
  static borshSchema = stateSchema;
  static zodSchema = stateZodSchema;

  borshSchema = stateSchema;
  zodSchema = stateZodSchema;

  constructor(value: StateType) {
    super(value);
  }

  static parse(value: StateType): State {
    return new State(stateZodSchema.parse(value));
  }
}

// Signed state schema
const signedStateSchema = BorshSchema.Struct({
  state: stateSchema,
  signature: BorshSchema.String,
});
type BorshSignedState =
  typeof signedStateSchema extends BorshSchema<infer T> ? T : never;
type BorshSignedStateTypeOf = TypeOf<BorshSignedState>;

const signedStateZodSchema = z.object({
  state: stateZodSchema,
  signature: z.string(),
});
type SignedStateZodSchemaType = z.infer<typeof signedStateZodSchema>;
export type SignedStateType = Equal<
  BorshSignedStateTypeOf,
  SignedStateZodSchemaType
>;

export class SignedState extends Schemable<
  BorshSignedState,
  typeof signedStateZodSchema
> {
  static borshSchema = signedStateSchema;
  static zodSchema = signedStateZodSchema;

  borshSchema = signedStateSchema;
  zodSchema = signedStateZodSchema;

  constructor(value: SignedStateType) {
    super(value);
  }

  static parse(value: unknown): SignedState {
    return new SignedState(signedStateZodSchema.parse(value));
  }
}
