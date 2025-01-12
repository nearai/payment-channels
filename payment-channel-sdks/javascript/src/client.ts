import {
  getProviderByNetwork,
  getSignerFromKeyPair,
  RpcQueryProvider,
} from "@near-js/client";
import { KeyPair, KeyPairString } from "@near-js/crypto";
import { AccessKeyList, BlockReference, CodeResult } from "@near-js/types";
import { DEFAULT_FUNCTION_CALL_GAS } from "@near-js/utils";
import { Wallet } from "@near-wallet-selector/core";
import { Buffer } from "buffer";
import { AccountId } from "near-sdk-js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  Account,
  Channel,
  ChannelEntry,
  ChannelId,
  ChannelType,
  NearToken,
  Result,
  SignedState,
  State,
} from "./types";

const DELIM = "_";
const DEFAULT_CURVE = "ed25519";
const DEFAULT_GAS = DEFAULT_FUNCTION_CALL_GAS * BigInt(10);
const FINALITY: BlockReference = { finality: "final" };

export const getAccountPublicKeys = async (
  accountId: AccountId,
  rpc: RpcQueryProvider
): Promise<Result<string[]>> => {
  try {
    const account = await rpc.query<AccessKeyList>({
      request_type: "view_access_key_list",
      account_id: accountId,
      ...FINALITY,
    });
    return {
      ok: true,
      value: account.keys
        .filter((key) => key.access_key.permission === "FullAccess")
        .map((key) => key.public_key),
    };
  } catch (e) {
    return {
      ok: false,
      error: new Error(`Error rpc querying public keys: ${e}`),
    };
  }
};

const PaymentChannelStorageElementSchema = z.object({
  id: z.string(),
  senderKeyPair: z.string().nullable(),
  channel: Channel.zodSchema,
});
const PaymentChannelStorageSchema = z.map(
  z.string(), // prefix + channel id
  PaymentChannelStorageElementSchema
);
export type PaymentChannelStorageElement = z.infer<
  typeof PaymentChannelStorageElementSchema
>;
export type PaymentChannelStorage = z.infer<typeof PaymentChannelStorageSchema>;

interface PaymentChannelStorageInterface {
  export(): PaymentChannelStorage;
  import(exported: any): void;
  get(channelId: ChannelId): PaymentChannelStorageElement | undefined;
  exists(channelId: ChannelId): boolean;
  create(
    channelId: ChannelId,
    channelStorageElement: PaymentChannelStorageElement
  ): void;
  delete(channelId: ChannelId): void;
}

export class PaymentChannelLocalStorage
  implements PaymentChannelStorageInterface
{
  private keyPrefix: string;

  constructor(keyPrefix: string = "payment-channel-storage") {
    this.keyPrefix = keyPrefix;

    const existingStorage = localStorage.getItem(this.keyPrefix);
    if (existingStorage === null) {
      const initStorage: PaymentChannelStorage = new Map();
      localStorage.setItem(
        this.keyPrefix,
        JSON.stringify(initStorage, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      );
    }
  }

  export(): PaymentChannelStorage {
    const storage: PaymentChannelStorage = new Map();
    for (const [key, value] of Object.entries(localStorage)) {
      if (key.startsWith(this.keyPrefix)) {
        const parseResult = PaymentChannelStorageElementSchema.safeParse(value);
        if (parseResult.success) {
          storage.set(key, parseResult.data);
        } else {
          console.error(
            `Unable to parse payment channel storage element: ${key} ${value}`
          );
        }
      }
    }
    return storage;
  }

  import(exported: any) {
    const parsedStorage = PaymentChannelStorageSchema.parse(exported);
    for (const [key, value] of parsedStorage) {
      localStorage.setItem(
        key,
        JSON.stringify(value, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      );
    }
  }

  get(channelId: ChannelId): PaymentChannelStorageElement | undefined {
    const key = this.keyPrefix + DELIM + channelId;
    const value = localStorage.getItem(key);
    return value
      ? PaymentChannelStorageElementSchema.parse(JSON.parse(value))
      : undefined;
  }

  exists(channelId: ChannelId) {
    const key = this.keyPrefix + DELIM + channelId;
    return localStorage.getItem(key) !== null;
  }

  create(
    channelId: ChannelId,
    channelStorageElement: PaymentChannelStorageElement
  ) {
    const key = this.keyPrefix + DELIM + channelId;
    localStorage.setItem(
      key,
      JSON.stringify(channelStorageElement, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );
  }

  delete(channelId: ChannelId) {
    const key = this.keyPrefix + DELIM + channelId;
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  }
}

interface PaymentChannelClientInterface {
  get_channel(channelId: ChannelId): Promise<Result<Channel | undefined>>;
  open_channel(
    senderAccountId: AccountId,
    receiverAccount: Account,
    deposit: NearToken,
    channelId?: ChannelId,
    gas?: NearToken
  ): Promise<Result<ChannelEntry>>;
  create_payment(
    senderAccountId: AccountId,
    channelId: ChannelId,
    amount: NearToken
  ): Promise<Result<SignedState>>;
}

export class PaymentChannelClient implements PaymentChannelClientInterface {
  protected contractAddress: string;
  protected network: string;
  private rpc: RpcQueryProvider;
  private wallet: Wallet;
  private storage: PaymentChannelStorageInterface;

  constructor(
    wallet: Wallet,
    contractAddress: string = "paymentchannel.near",
    network: string = "mainnet"
  ) {
    this.contractAddress = contractAddress;
    this.network = network;
    this.rpc = getProviderByNetwork(network);
    this.wallet = wallet;
    this.storage = new PaymentChannelLocalStorage();
  }

  async get_channel(
    channelId: ChannelId
  ): Promise<Result<Channel | undefined>> {
    const result = await this.rpc.query<CodeResult>({
      request_type: "call_function",
      account_id: this.contractAddress,
      method_name: "channel",
      args_base64: btoa(JSON.stringify({ channel_id: channelId })),
      ...FINALITY,
    });
    console.log("result", Buffer.from(result.result).toString());
    const payload = JSON.parse(Buffer.from(result.result).toString());
    console.log("payload", payload);
    if (payload === null) {
      return {
        ok: true,
        value: undefined,
      };
    }
    return {
      ok: true,
      value: Channel.parse(payload),
    };
  }

  /**
   * Opens a new payment channel. This method should be called by the 'sender' in the payment channel relationship.
   */
  async open_channel(
    senderAccountId: AccountId,
    receiverAccount: AccountId | Account,
    deposit: NearToken,
    channelId?: ChannelId,
    gas?: NearToken
  ): Promise<Result<ChannelEntry>> {
    const pcChannelId = channelId ?? uuidv4();
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    // TODO: check if the channel already exists on the contract
    if (this.storage.exists(pcChannelId)) {
      return {
        ok: false,
        error: new Error(`Channel ${pcChannelId} already exists`),
      };
    }

    // If we are povided an account + public key, use that
    // if just an account id, lookup the public key
    const validatedReceiverAccountResult: Result<Account> = await (async () => {
      try {
        if (typeof receiverAccount === "string") {
          const publicKeys = await getAccountPublicKeys(
            receiverAccount,
            this.rpc
          );
          if (!publicKeys.ok) {
            return { ok: false, error: publicKeys.error };
          }
          if (publicKeys.value.length === 0) {
            return {
              ok: false,
              error: new Error(
                `No public key found for account ${receiverAccount}`
              ),
            };
          }
          return {
            ok: true,
            value: new Account({
              account_id: receiverAccount,
              public_key: publicKeys.value[0] ?? "",
            }),
          };
        } else {
          return { ok: true, value: receiverAccount };
        }
      } catch (e) {
        return {
          ok: false,
          error: new Error(
            `Error validating receiver account public key: ${e}`
          ),
        };
      }
    })();
    if (!validatedReceiverAccountResult.ok) {
      return { ok: false, error: validatedReceiverAccountResult.error };
    }
    const validatedReceiverAccount = validatedReceiverAccountResult.value;

    // create and store new channel + sender key pair for channel
    const channelKeyPair: KeyPair = KeyPair.fromRandom(DEFAULT_CURVE);
    const senderAccount = new Account({
      account_id: senderAccountId,
      public_key: channelKeyPair.getPublicKey().toString(),
    });
    const newChannel: ChannelType = {
      receiver: validatedReceiverAccount.value,
      sender: senderAccount.value,
      added_balance: deposit.as_yocto_near(),
      withdrawn_balance: BigInt(0),
      force_close_started: null,
    };
    const newChannelStorageElement: PaymentChannelStorageElement = {
      id: pcChannelId,
      channel: newChannel,
      senderKeyPair: channelKeyPair.toString(),
    };

    // Keep within local storage, delete if wallet fails
    this.storage.create(pcChannelId, newChannelStorageElement);

    // Use wallet to sign and send transaction
    // but use the generated public key as the channel sender
    // this is so we can easily sign messages without having call the wallet
    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: senderAccount.value.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "open_channel",
              args: {
                channel_id: pcChannelId,
                receiver: validatedReceiverAccount.value,
                sender: senderAccount.value,
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: deposit.as_yocto_near().toString(),
            },
          },
        ],
      });
      if (result === undefined) {
        return {
          ok: false,
          error: new Error("Failed to open channel"),
        };
      }

      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return {
          ok: true,
          value: {
            id: pcChannelId,
            channel: newChannel,
          },
        };
      }
      return { ok: false, error: new Error("Failed to open channel") };
    } catch (e) {
      this.storage.delete(pcChannelId);
      return {
        ok: false,
        error: new Error("Failed to open channel. Interrupted."),
      };
    }
  }

  async create_payment(
    senderAccountId: AccountId,
    channelId: ChannelId,
    amount: NearToken
  ): Promise<Result<SignedState>> {
    const channelStorageElement = this.storage.get(channelId);
    if (!channelStorageElement) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }

    const senderKeyPairString = channelStorageElement.senderKeyPair;
    if (senderKeyPairString === null) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} sender key pair not found`),
      };
    }

    if (channelStorageElement.channel.sender.account_id !== senderAccountId) {
      return {
        ok: false,
        error: new Error(
          `Channel ${channelId} sender does not match provided sender account id`
        ),
      };
    }

    // Trust the 'key pair string' is valid key pair string
    const senderKeyPair = KeyPair.fromString(
      senderKeyPairString as KeyPairString
    );
    const signer = getSignerFromKeyPair(senderKeyPair);

    // Create, sign and return state
    const state = new State({
      channel_id: channelId,
      spent_balance: amount.as_yocto_near(),
    });
    const signature = await signer.signMessage(state.to_borsh());
    const signedState = new SignedState({
      state: state.value,
      signature: Array.from(signature),
    });

    return { ok: true, value: signedState };
  }

  // async start_force_close_channel(signer: Account, channelId: ChannelId) {}

  // async finish_force_close_channel(signer: Account, channelId: ChannelId) {}

  // async topup(signer: Account, channelId: ChannelId, amount: NearToken) {}

  // async withdraw(signer: Account, channelId: ChannelId, payment: SignedState) {}

  // async list_channels() {}
}
