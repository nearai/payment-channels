import {
  getProviderByNetwork,
  getSignerFromKeystore,
  type RpcQueryProvider,
  SignedTransactionComposer,
} from "@near-js/client";
import { KeyStore } from "@near-js/keystores";
import { BlockReference } from "@near-js/types";
import { DEFAULT_FUNCTION_CALL_GAS } from "@near-js/utils";
import { v4 as uuidv4 } from "uuid";
import {
  Account,
  Channel,
  ChannelEntry,
  ChannelId,
  NearToken,
  Result,
} from "./types";

const DEFAULT_GAS = DEFAULT_FUNCTION_CALL_GAS * BigInt(10);
const FINALITY: BlockReference = { finality: "final" };

export class PaymentChannelClient {
  private contractAddress: string;
  private network: string;
  private rpcProvider: RpcQueryProvider;
  private keyStore: KeyStore;

  constructor(
    keystore: KeyStore,
    contractAddress: string = "paymentchannel.near",
    network: string = "mainnet"
  ) {
    this.contractAddress = contractAddress;
    this.network = network;
    this.rpcProvider = getProviderByNetwork(network);
    this.keyStore = keystore;
  }

  /**
   * Opens a new payment channel. This method should be called by the 'sender' in the payment channel relationship.
   */
  async open_channel(
    senderAccount: Account,
    receiverAccount: Account,
    amount: NearToken,
    channelId?: ChannelId
  ): Promise<Result<ChannelEntry>> {
    const pcChannelId = channelId ?? uuidv4();
    const signer = getSignerFromKeystore(
      senderAccount.value.account_id,
      this.network,
      this.keyStore
    );

    const { outcome } = await SignedTransactionComposer.init({
      receiver: this.contractAddress,
      sender: senderAccount.value.account_id,
      deps: {
        rpcProvider: this.rpcProvider,
        signer: signer,
      },
    })
      .functionCall(
        "open_channel",
        {
          channel_id: pcChannelId,
          receiver: receiverAccount.value,
          sender: senderAccount.value,
        },
        DEFAULT_GAS,
        amount
      )
      .signAndSend(FINALITY);

    const status = outcome.status as { [key: string]: any };
    if ("SuccessValue" in status) {
      const channel = new Channel({
        receiver: receiverAccount.value,
        sender: senderAccount.value,
        added_balance: amount,
        withdrawn_balance: BigInt(0),
        force_close_started: null,
      });
      return { ok: true, value: { id: pcChannelId, channel } };
    }
    return { ok: false, error: new Error("Failed to open channel") };
  }
}
