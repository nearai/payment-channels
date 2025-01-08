import { getProviderByNetwork, type RpcQueryProvider } from "@near-js/client";
import { LocalStorageKeyStore } from "./localstoragekeystore";

class PaymentChannelClient {
  private contractAddress: string;
  private rpcProvider: RpcQueryProvider;
  private keyStore: LocalStorageKeyStore;

  constructor(
    contractAddress: string = "paymentchannel.near",
    network: string = "mainnet"
  ) {
    this.contractAddress = contractAddress;
    this.rpcProvider = getProviderByNetwork(network);
    this.keyStore = new LocalStorageKeyStore();
  }
}

export const client = new PaymentChannelClient();
