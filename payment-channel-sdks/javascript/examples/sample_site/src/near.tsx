// wallet selector
import "@near-wallet-selector/modal-ui/styles.css";

import { setupBitteWallet } from "@near-wallet-selector/bitte-wallet";
import {
  setupWalletSelector,
  WalletModuleFactory,
  WalletSelector,
  type NetworkId,
} from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupLedger } from "@near-wallet-selector/ledger";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNearMobileWallet } from "@near-wallet-selector/near-mobile-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { setupWelldoneWallet } from "@near-wallet-selector/welldone-wallet";

import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { PaymentChannelClient } from "../../../src/client";

export const networkId: NetworkId = "mainnet";
export const contractId = "paymentchannel.near";

export class WalletSelectorWrapper {
  private networkId: NetworkId;
  // @ts-ignore
  walletSelector: WalletSelector;

  constructor({ networkId = "mainnet" }: { networkId: NetworkId }) {
    this.networkId = networkId;
  }

  async startUp() {
    this.walletSelector = await setupWalletSelector({
      network: this.networkId,
      modules: [
        setupMeteorWallet(),
        setupLedger(),
        setupBitteWallet(),
        setupHereWallet(),
        setupSender(),
        setupNearMobileWallet(),
        setupWelldoneWallet(),
        setupMyNearWallet(),
      ] as WalletModuleFactory[],
    });
  }

  getSignedAccountId(): string | null {
    const accounts = this.walletSelector.store.getState().accounts;
    return accounts?.[0]?.accountId || null;
  }

  isInitialized() {
    return this.walletSelector !== undefined;
  }

  isSignedIn() {
    return this.walletSelector.isSignedIn();
  }

  /**
   * Displays a modal to login the user
   */
  async signIn() {
    const modal = setupModal(this.walletSelector, {
      contractId: contractId,
    });
    modal.show();
    return this.getSignedAccountId();
  }

  /**
   * Logout the user
   */
  async signOut() {
    const selectedWallet = await this.walletSelector.wallet();
    selectedWallet.signOut();
  }
}

interface SignedAccountIdContextType {
  signedAccountId: string | null;
  setSignedAccountId: Dispatch<SetStateAction<string | null>>;
}

const SignedAccountIdContext = createContext<
  SignedAccountIdContextType | null
>(null);

export function SignedAccountIdProvider({ children }: { children: ReactNode }) {
  const [signedAccountId, setSignedAccountId] = useState<string | null>(null);

  return (
    <SignedAccountIdContext.Provider value={{ signedAccountId, setSignedAccountId }}>
      {children}
    </SignedAccountIdContext.Provider>
  );
}

// Create a custom hook to use the signed account ID
export const useSignedAccountId = () => {
  const context = useContext(SignedAccountIdContext);
  if (!context) {
    throw new Error(
      "useSignedAccountId must be used within a SignedAccountIdProvider"
    );
  }
  return context;
};


interface WalletSelectorContextType {
  walletSelector: WalletSelector | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isSignedIn: () => boolean;
}

const WalletSelectorContext = createContext<WalletSelectorContextType | null>(null);

export const WalletSelectorProvider = ({ children }: { children: ReactNode }) => {
  const signedAccountId = useSignedAccountId();
  const [walletSelector, setWalletSelector] = useState<WalletSelector | null>(
    null
  );

  useEffect(() => {
    async function init() {
      const walletSelector = await setupWalletSelector({
        network: networkId,
        modules: [
          setupMeteorWallet(),
          setupLedger(),
          setupBitteWallet(),
          setupHereWallet(),
          setupSender(),
          setupNearMobileWallet(),
          setupWelldoneWallet(),
          setupMyNearWallet(),
        ] as WalletModuleFactory[],
      });
      setWalletSelector(walletSelector);
      walletSelector.store.observable.subscribe(async (state) => {
        const signedAccount = state?.accounts.find(
          (account) => account.active
        )?.accountId;
        if (signedAccountId) {
          signedAccountId.setSignedAccountId(signedAccount ?? null);
        }
      });
      if (walletSelector.isSignedIn()) {
        const signedAccount =
          walletSelector.store.getState().accounts?.[0]?.accountId || null;
        if (signedAccountId && signedAccount) {
          signedAccountId.setSignedAccountId(signedAccount);
        }
      }
    }
    init();
  }, []);

  const signIn = async () => {
    if (!walletSelector) return;
    const modal = setupModal(walletSelector, {
      contractId: contractId,
    });
    modal.show();
  };

  const signOut = async () => {
    if (!walletSelector || !signedAccountId) return;
    const selectedWallet = await walletSelector.wallet();
    selectedWallet.signOut();
  };

  const isSignedIn = () => {
    return walletSelector?.isSignedIn() ?? false;
  };

  return (
    <WalletSelectorContext.Provider value={{ walletSelector, signIn, signOut, isSignedIn }}>
      {children}
    </WalletSelectorContext.Provider>
  );
};

export const useWalletSelector = () => {
  const context = useContext(WalletSelectorContext);
  if (context === undefined) {
    throw new Error("useWalletSelector must be used within a WalletSelectorProvider");
  }
  return context;
};

interface PaymentChannelClientContextType {
  pcClient: PaymentChannelClient | null;
}

const PaymentChannelClientContext = createContext<PaymentChannelClientContextType | null>(null);

export const PaymentChannelClientProvider = ({ children }: { children: ReactNode }) => {
  const signedAccountId = useSignedAccountId();
  const walletSelector = useWalletSelector();
  const [pcClient, setPcClient] = useState<PaymentChannelClient | null>(null);
  useEffect(() => {
    async function init() {
      if (!walletSelector || !signedAccountId) return;
      if (!walletSelector.isSignedIn()) return;
      if (!walletSelector.walletSelector) return;
      const wallet = await walletSelector.walletSelector.wallet();
      const client = new PaymentChannelClient(wallet);
      setPcClient(client);
    }
    init();
  }, [walletSelector, signedAccountId]);
  return <PaymentChannelClientContext.Provider value={{ pcClient }}>
    {children}
  </PaymentChannelClientContext.Provider>;
};

export const usePaymentChannelClient = () => {
  const context = useContext(PaymentChannelClientContext);
  if (context === undefined) {
    throw new Error("usePaymentChannelClient must be used within a PaymentChannelClientProvider");
  }
  return context;
};
