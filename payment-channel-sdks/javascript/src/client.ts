import {
  getProviderByNetwork,
  getSignerFromKeyPair,
  RpcQueryProvider,
} from "@near-js/client";
import { KeyPair, KeyPairString } from "@near-js/crypto";
import { BlockReference, CodeResult } from "@near-js/types";
import { DEFAULT_FUNCTION_CALL_GAS } from "@near-js/utils";
import { Wallet } from "@near-wallet-selector/core";
import { Buffer } from "buffer";
import { AccountId } from "near-sdk-js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  Account,
  bigIntPreprocess,
  Channel,
  ChannelEntry,
  ChannelId,
  ChannelType,
  NearToken,
  Result,
  Signature,
  SignedState,
  SignedStateType,
  State,
  stringify_bigint,
} from "./types";

const DELIM = "_";
const DEFAULT_CONCURRENCY = 16;
const PAYMENT_CHANNEL_STORAGE_KEY_PREFIX = "payment-channel-storage";
const DEFAULT_CURVE = "ed25519";
const DEFAULT_GAS = DEFAULT_FUNCTION_CALL_GAS * BigInt(10);
const ZERO_NEAR = NearToken.parse_yocto_near("0");
const FINALITY: BlockReference = { finality: "final" };

const mapSemaphore = async <T, R>(
  items: T[],
  concurrency: number,
  f: (t: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  for (const item of items) {
    const p = f(item) // process, add result, then self remove
      .then((v) => {
        results.push(v);
      })
      .finally(() => {
        promises.splice(promises.indexOf(p), 1);
      });
    promises.push(p);
    if (promises.length >= concurrency) await Promise.race(promises);
  }
  await Promise.all(promises);
  return results;
};

const PaymentChannelStorageElementSchema = z.object({
  id: z.string(),
  senderKeyPair: z.string().nullable(),
  channel: Channel.zodSchema,
  latest_spent_balance: z.preprocess(
    bigIntPreprocess,
    z.bigint().default(BigInt(0))
  ),
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
  /**
   * Exports the payment channel storage including
   * channel data and keypair information
   * @returns The payment channel storage as a JSON object
   */
  export(): PaymentChannelStorage;

  /**
   * Imports the payment channel storage from a JSON object
   * @param exported - The payment channel storage as a JSON object
   */
  import(exported: any): void;

  /**
   * Retrieves a payment channel from the storage
   * @param channelId - The ID of the channel to retrieve
   * @returns The payment channel storage element if found, otherwise undefined
   */
  get(channelId: ChannelId): PaymentChannelStorageElement | undefined;

  /**
   * Checks if a payment channel exists in the storage
   * @param channelId - The ID of the channel to check
   * @returns True if the channel exists, otherwise false
   */
  exists(channelId: ChannelId): boolean;

  /**
   * Creates a new payment channel in the storage
   * @param channelId - The ID of the channel to create
   * @param channelStorageElement - The payment channel storage element to create
   */
  create(
    channelId: ChannelId,
    channelStorageElement: PaymentChannelStorageElement
  ): void;

  /**
   * Deletes a payment channel from the storage
   * @param channelId - The ID of the channel to delete
   */
  delete(channelId: ChannelId): void;
}

export class PaymentChannelLocalStorage
  implements PaymentChannelStorageInterface
{
  private keyPrefix: string;

  constructor(keyPrefix: string = PAYMENT_CHANNEL_STORAGE_KEY_PREFIX) {
    this.keyPrefix = keyPrefix;
  }

  export(): PaymentChannelStorage {
    const storage: PaymentChannelStorage = new Map();
    for (const [key, value] of Object.entries(localStorage)) {
      if (key.startsWith(this.keyPrefix)) {
        const rawValue = JSON.parse(value);
        const parseResult =
          PaymentChannelStorageElementSchema.safeParse(rawValue);
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
  /**
   * Retrieves a payment channel by its ID from the contract
   * @param channelId - The unique identifier of the channel to retrieve
   * @returns A Result containing either the Channel object if found, or undefined if not found
   */
  get_channel(channelId: ChannelId): Promise<Result<Channel | undefined>>;

  /**
   * Opens a new payment channel between a sender and receiver. This method should be called by
   * the sender of the channel. A one time keypair will be generated on behalf of the sender
   * and stored in the local storage. This keypair will be used to sign payment messages.
   * The receiver public key needs to provided externally (preferably from the receiver).
   * @param senderAccountId - The account ID of the sender who will fund the channel
   * @param receiverAccount - The Account object containing details of the receiver
   * @param deposit - The initial deposit amount in NEAR tokens to fund the channel
   * @param channelId - Optional custom channel ID. If not provided, one will be generated
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the created ChannelEntry if successful
   */
  open_channel(
    senderAccountId: AccountId,
    receiverAccount: Account,
    deposit: NearToken,
    channelId?: ChannelId,
    gas?: NearToken
  ): Promise<Result<ChannelEntry>>;

  /**
   * Creates a new payment message for an existing channel. This method should be called by the
   * sender of the channel. A payment message contains a signature signed by the sender's keypair.
   * Keypair is receive from localstorage.
   * @param channelId - The ID of the channel for creating the payment
   * @param amount - The payment amount in NEAR tokens
   * @returns A Result containing the SignedState representing the payment if successful
   */
  create_payment(
    channelId: ChannelId,
    amount: NearToken
  ): Promise<Result<SignedState>>;

  /**
   * Closes a payment channel by sending a signed state to the contract.
   * This method can be called by anyone, the caller must have the correct
   * signed state.
   * @param channelId - The ID of the channel to close
   * @param closeMessage - The signed state containing the close message
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the void if successful
   */
  close(
    channelId: ChannelId,
    closeMessage: SignedState,
    gas?: NearToken
  ): Promise<Result<void>>;

  /**
   * Starts the force close process for a payment channel meant to be called by the sender.
   * In the case when a receiver does not appropriately satisfy a payment from the sender,
   * the sender can force close the channel to return their deposit. However, the sender
   * will need to wait for a waiting period. Once the waiting period is over, the sender
   * can call the finish_force_close_channel method to close the channel and return their deposits.
   * @param channelId - The ID of the channel to start the force close
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the void if successful
   */
  start_force_close(
    channelId: ChannelId,
    gas?: NearToken
  ): Promise<Result<void>>;

  /**
   * Finishes the force close process for a payment channel meant to be called by the sender.
   * @param channelId - The ID of the channel to finish the force close
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the void if successful
   */
  finish_force_close(
    channelId: ChannelId,
    gas?: NearToken
  ): Promise<Result<void>>;

  /**
   * Topups a payment channel by the sender.
   * @param channelId - The ID of the channel to topup
   * @param amount - The amount of NEAR tokens to topup the channel
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the void if successful
   */
  topup(
    channelId: ChannelId,
    amount: NearToken,
    gas?: NearToken
  ): Promise<Result<void>>;

  /**
   * Withdraws funds from a payment channel.
   * @param channelId - The ID of the channel to withdraw from
   * @param payment - The amount of NEAR tokens to withdraw from the channel
   * @param gas - Optional gas amount for the transaction. Uses default if not specified
   * @returns A Result containing the void if successful
   */
  withdraw(
    channelId: ChannelId,
    payment: SignedState,
    gas?: NearToken
  ): Promise<Result<void>>;

  /**
   * Lists all payment channels.
   * @param refresh - If true, the channels will be refreshed from the contract into local storage
   * @returns A Result containing the list of channels if successful
   */
  list_channels(refresh?: boolean): Promise<Result<ChannelEntry[]>>;

  /**
   * Exports the payment channel storage including
   * channel data and keypair information
   * @returns The payment channel storage as a JSON object
   */
  export(): PaymentChannelStorage;

  /**
   * Imports the payment channel storage from a JSON object
   * @param exported - The payment channel storage as a JSON object
   */
  import(exported: PaymentChannelStorage): void;
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
    const payload = JSON.parse(Buffer.from(result.result).toString());
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

  async open_channel(
    senderAccountId: AccountId,
    receiverAccount: Account,
    deposit: NearToken,
    channelId?: ChannelId,
    gas?: NearToken
  ): Promise<Result<ChannelEntry>> {
    const pcChannelId = channelId ?? uuidv4();
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    if (this.storage.exists(pcChannelId)) {
      return {
        ok: false,
        error: new Error(`Channel ${pcChannelId} already exists`),
      };
    }

    const channel = await this.get_channel(pcChannelId);
    if (channel.ok && channel.value !== undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${pcChannelId} already exists`),
      };
    }

    // Create a new keypair for the sender
    const channelKeyPair: KeyPair = KeyPair.fromRandom(DEFAULT_CURVE);
    const senderAccount = new Account({
      account_id: senderAccountId,
      public_key: channelKeyPair.getPublicKey().toString(),
    });
    const newChannel: ChannelType = {
      receiver: receiverAccount.value,
      sender: senderAccount.value,
      added_balance: deposit.as_yocto_near(),
      withdrawn_balance: ZERO_NEAR.as_yocto_near(),
      force_close_started: null,
    };
    const newChannelStorageElement: PaymentChannelStorageElement = {
      id: pcChannelId,
      channel: newChannel,
      senderKeyPair: channelKeyPair.toString(),
      latest_spent_balance: BigInt(0),
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
                receiver: receiverAccount.value,
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
    channelId: ChannelId,
    amount: NearToken,
    rememberPayment: boolean = false
  ): Promise<Result<SignedState>> {
    const channelStorageElement = this.storage.get(channelId);
    if (!channelStorageElement) {
      return {
        ok: false,
        error: new Error(
          `Channel ${channelId} not found in storage. Please open a channel first.`
        ),
      };
    }

    const senderKeyPairString = channelStorageElement.senderKeyPair;
    if (senderKeyPairString === null) {
      return {
        ok: false,
        error: new Error(
          `Channel ${channelId} sender key pair not found. Please open a channel first.`
        ),
      };
    }

    // If there is a latest payment, check if the new amount
    // is greater than the latest payment
    if (amount.as_yocto_near() > channelStorageElement.latest_spent_balance) {
      return {
        ok: false,
        error: new Error("Payment amount must be greater than latest payment"),
      };
    }

    // Trust the 'key pair string' is valid key pair string
    const senderKeyPair = KeyPair.fromString(
      senderKeyPairString as KeyPairString
    );
    const signer = getSignerFromKeyPair(senderKeyPair);

    // Create, sign and return state
    // Signature are created via:
    // state -> borsh -> sign -> base58
    const state = new State({
      channel_id: channelId,
      spent_balance: amount.as_yocto_near(),
    });
    const curveType = senderKeyPair.getPublicKey().keyType;
    const signatureRaw = Buffer.from(
      await signer.signMessage(state.to_borsh())
    );
    const signedState = new SignedState({
      state: state.value,
      signature: Signature.from_curve(curveType, signatureRaw).value,
    });

    if (rememberPayment) {
      channelStorageElement.latest_spent_balance =
        signedState.value.state.spent_balance;
      this.storage.create(channelId, channelStorageElement);
    }

    return { ok: true, value: signedState };
  }

  async close(
    channelId: ChannelId,
    closeMessage: SignedState,
    gas?: NearToken
  ): Promise<Result<void>> {
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    const channelResult = await this.get_channel(channelId);
    if (!channelResult.ok) {
      return {
        ok: false,
        error: new Error(
          `Error getting channel ${channelId}: ${channelResult.error}`
        ),
      };
    }
    if (channelResult.value === undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }
    const channel = channelResult.value.value;

    // Convert the signed state to a signed state where
    // the signature is a b58 encoded string
    console.log("Raw sig: ", closeMessage.value.signature);
    const signature = new Signature(closeMessage.value.signature);
    const closeMessageStringSignature: Omit<SignedStateType, "signature"> & {
      signature: string;
    } = {
      state: closeMessage.value.state,
      signature: signature.as_string(),
    };
    console.log(closeMessageStringSignature);

    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: channel.sender.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "close",
              args: {
                state: JSON.parse(
                  stringify_bigint(closeMessageStringSignature)
                ),
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: ZERO_NEAR.as_yocto_near().toString(),
            },
          },
        ],
      });
      if (result === undefined) {
        return {
          ok: false,
          error: new Error("Failed to close channel"),
        };
      }

      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return {
          ok: true,
          value: undefined,
        };
      }
      return {
        ok: false,
        error: new Error("Failed to close channel"),
      };
    } catch (e) {
      return {
        ok: false,
        error: new Error(`Failed to close channel: ${e}`),
      };
    }
  }

  async start_force_close(
    channelId: ChannelId,
    gas?: NearToken
  ): Promise<Result<void>> {
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    const channelResult = await this.get_channel(channelId);
    if (!channelResult.ok) {
      return {
        ok: false,
        error: new Error(
          `Error getting channel ${channelId}: ${channelResult.error}`
        ),
      };
    }
    if (channelResult.value === undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }
    const channel = channelResult.value.value;

    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: channel.sender.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "force_close_start",
              args: {
                channel_id: channelId,
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: ZERO_NEAR.as_yocto_near().toString(),
            },
          },
        ],
      });
      if (result === undefined) {
        return {
          ok: false,
          error: new Error("Failed to start force close channel"),
        };
      }

      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return {
          ok: true,
          value: undefined,
        };
      }
      return {
        ok: false,
        error: new Error("Failed to start force close channel"),
      };
    } catch (e) {
      return {
        ok: false,
        error: new Error(`Failed to start force close channel: ${e}`),
      };
    }
  }

  async finish_force_close(
    channelId: ChannelId,
    gas?: NearToken
  ): Promise<Result<void>> {
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    const channelResult = await this.get_channel(channelId);
    if (!channelResult.ok) {
      return {
        ok: false,
        error: new Error(
          `Error getting channel ${channelId}: ${channelResult.error}`
        ),
      };
    }
    if (channelResult.value === undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }
    const channel = channelResult.value.value;

    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: channel.sender.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "force_close_finish",
              args: {
                channel_id: channelId,
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: ZERO_NEAR.as_yocto_near().toString(),
            },
          },
        ],
      });

      if (result === undefined) {
        return {
          ok: false,
          error: new Error("Failed to finish force close channel"),
        };
      }

      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return {
          ok: true,
          value: undefined,
        };
      }
      return {
        ok: false,
        error: new Error("Failed to finish force close channel"),
      };
    } catch (e) {
      return {
        ok: false,
        error: new Error(`Failed to finish force close channel: ${e}`),
      };
    }
  }

  async topup(
    channelId: ChannelId,
    amount: NearToken,
    gas?: NearToken
  ): Promise<Result<void>> {
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    const channelResult = await this.get_channel(channelId);
    if (!channelResult.ok) {
      return {
        ok: false,
        error: new Error(
          `Error getting channel ${channelId}: ${channelResult.error}`
        ),
      };
    }
    if (channelResult.value === undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }
    const channel = channelResult.value.value;

    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: channel.sender.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "topup",
              args: {
                channel_id: channelId,
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: amount.as_yocto_near().toString(),
            },
          },
        ],
      });
      if (result === undefined) {
        return {
          ok: false,
          error: new Error("Failed to topup channel"),
        };
      }

      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return { ok: true, value: undefined };
      }
      return {
        ok: false,
        error: new Error("Failed to topup channel"),
      };
    } catch (e) {
      return {
        ok: false,
        error: new Error(`Failed to topup channel: ${e}`),
      };
    }
  }

  async withdraw(
    channelId: ChannelId,
    payment: SignedState,
    gas?: NearToken
  ): Promise<Result<void>> {
    const transactionGas: NearToken =
      gas ?? NearToken.parse_yocto_near(DEFAULT_GAS);

    const channelResult = await this.get_channel(channelId);
    if (!channelResult.ok) {
      return {
        ok: false,
        error: new Error(
          `Error getting channel ${channelId}: ${channelResult.error}`
        ),
      };
    }
    if (channelResult.value === undefined) {
      return {
        ok: false,
        error: new Error(`Channel ${channelId} not found`),
      };
    }
    const channel = channelResult.value.value;

    try {
      const result = await this.wallet.signAndSendTransaction({
        receiverId: this.contractAddress,
        signerId: channel.sender.account_id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "withdraw",
              args: {
                state: payment.value,
              },
              gas: transactionGas.as_yocto_near().toString(),
              deposit: ZERO_NEAR.as_yocto_near().toString(),
            },
          },
        ],
      });
      if (result === undefined) {
        return {
          ok: false,
          error: new Error(
            "Failed to withdraw from channel. Wallet response undefined"
          ),
        };
      }
      const status = result.status as { [key: string]: any };
      if ("SuccessValue" in status) {
        return { ok: true, value: undefined };
      }
      return {
        ok: false,
        error: new Error("Failed to withdraw from channel"),
      };
    } catch (e) {
      return {
        ok: false,
        error: new Error(`Failed to withdraw from channel: ${e}`),
      };
    }
  }

  async list_channels(refresh?: boolean): Promise<Result<ChannelEntry[]>> {
    const refreshResolved = refresh ?? false;

    if (refreshResolved) {
      const storageExport = this.storage.export();
      const allOpenChannelIds = Array.from(storageExport.values())
        .filter((e) => !new Channel(e.channel).is_closed())
        .map((e) => e.id);
      await mapSemaphore(
        allOpenChannelIds,
        DEFAULT_CONCURRENCY,
        async (channelId) => {
          const channelResult = await this.get_channel(channelId);
          if (channelResult.ok && channelResult.value) {
            const channel = channelResult.value;
            const storageElement = this.storage.get(channelId);
            if (storageElement) {
              storageElement.channel = channel.value;
              this.storage.create(channelId, storageElement);
            }
          }
        }
      );
    }

    const storageExport = this.storage.export();
    const channelEntries = Array.from(storageExport.values()).map(
      (element) => ({
        id: element.id,
        channel: element.channel,
      })
    );
    return {
      ok: true,
      value: channelEntries,
    };
  }

  export(): PaymentChannelStorage {
    return this.storage.export();
  }

  import(exported: PaymentChannelStorage): void {
    this.storage.import(exported);
  }
}
