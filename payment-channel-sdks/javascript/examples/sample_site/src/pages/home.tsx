import React from 'react';
import { useContext, useState, useEffect } from 'react';
import { useSignedAccountId, usePaymentChannelClient, useWalletSelector } from '../near';
import { Account, NearToken, SignedState, Channel } from "near-payment-channel-sdk";

// @ts-ignore
import styles from '../styles/app.module.css';
import { getProviderByNetwork } from '@near-js/client';
import { AccountView } from '@near-js/types';

const functionDescriptions = {
  open_channel: "Create a new payment channel between sender and receiver",
  create_payment: "Create a new payment within an existing channel",
  close_channel: "Close an existing payment channel",
  start_force_close_channel: "Initiate forced closure of a channel",
  finish_force_close_channel: "Complete forced closure of a channel",
  topup: "Add funds to an existing channel",
  withdraw: "Withdraw funds from a channel",
  get_channel: "Get details of a specific channel",
  list_channels: "View all available channels"
};

const checkAccountExists = async (accountId: string): Promise<boolean> => {
  try {
    const rpc = getProviderByNetwork("mainnet");
    await rpc.query<AccountView>({
      request_type: "view_account",
      account_id: accountId,
      finality: "final"
    });
    return true;
  } catch (e) {
    return false;
  }
};

export default function Home() {
  const signedAccountId = useSignedAccountId();
  const walletSelector = useWalletSelector();
  const pcClient = usePaymentChannelClient();

  const [isSetup, setIsSetup] = useState<boolean>(false);
  useEffect(() => {
    if (walletSelector && pcClient && signedAccountId) {
      if (walletSelector.walletSelector && pcClient.pcClient && signedAccountId.signedAccountId) {
        setIsSetup(true);
        return;
      }
    }
    setIsSetup(false);
  }, [signedAccountId, walletSelector, pcClient]);

  // open channel state
  const [receiverAccountId, setReceiverAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [openChannelError, setOpenChannelError] = useState<string | null>("");

  // create payment state
  const [paymentChannelId, setPaymentChannelId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [createPaymentError, setCreatePaymentError] = useState<string | null>("");
  const [paymentEncoded, setPaymentEncoded] = useState<boolean>(true);

  // get channel state
  const [getChannelChannelId, setGetChannelChannelId] = useState<string>("");
  const [getChannelError, setGetChannelError] = useState<string | null>("");

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Payment Channel Interface</h1>

      {isSetup && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <h2>{"Open Channel"}</h2>
            <p>{functionDescriptions.open_channel}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setOpenChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setOpenChannelError("Not initialized");
                  return;
                }

                const wallet = await walletSelector.walletSelector.wallet();
                const accounts = await wallet.getAccounts();
                const accountRaw = accounts.find((account) => account.accountId === signedAccountId.signedAccountId);
                if (!accountRaw) {
                  setOpenChannelError("No account found");
                  return;
                };
                const accountId = accountRaw.accountId;

                const receiverAccountExists = await checkAccountExists(receiverAccountId);
                if (!receiverAccountExists) {
                  setOpenChannelError(`Receiver account ${receiverAccountId} does not exist`);
                  return;
                }

                const deposit = NearToken.parse_near(amount);
                const result = await pcClient.pcClient.open_channel(accountId, receiverAccountId, deposit);
                if (!result.ok) {
                  setOpenChannelError(result.error.message);
                  return;
                }
                console.log(result.value);
                setOpenChannelError(`Created channel with ID: ${result.value.id}`);
              } catch (e: any) {
                setOpenChannelError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="receiverAccountId">Receiver Account ID</label>
                <input
                  type="text"
                  id="receiverAccountId"
                  value={receiverAccountId}
                  onChange={(e) => setReceiverAccountId(e.target.value)}
                  placeholder="e.g. receiver.near"
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="amount">Amount (in NEAR)</label>
                <input
                  type="text"
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  max="1"
                  step="0.000000000000000000000001"
                  required
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {openChannelError && <p className={styles.error}>{openChannelError}</p>}
          </div>

          <div className={styles.card}>
            <h2>{"Create Payment"}</h2>
            <p>{functionDescriptions.create_payment}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setOpenChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setOpenChannelError("Not initialized");
                  return;
                }

                const wallet = await walletSelector.walletSelector.wallet();
                const accounts = await wallet.getAccounts();
                const accountRaw = accounts.find((account) => account.accountId === signedAccountId.signedAccountId);
                if (!accountRaw) {
                  setOpenChannelError("No account found");
                  return;
                };
                const accountId = accountRaw.accountId;

                const payment = NearToken.parse_near(paymentAmount);
                const result = await pcClient.pcClient.create_payment(accountId, paymentChannelId, payment);
                if (!result.ok) {
                  setCreatePaymentError(result.error.message);
                  return;
                } else {

                  const signedState = result.value;
                  if (paymentEncoded) {
                    const encodedState = signedState.to_borsh().toString('base64');
                    const message = `Payment payload encoded: ${encodedState}`;
                    setCreatePaymentError(message);
                  } else {
                    const stateJSON = JSON.stringify(signedState.value, (_, value) =>
                      typeof value === 'bigint'
                          ? value.toString()
                          : value);
                    const message = `Payment payload: ${stateJSON}`;
                    setCreatePaymentError(message);
                  }
                }
              } catch (e: any) {
                setCreatePaymentError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="paymentChannelId">Payment Channel ID</label>
                <input
                  type="text"
                  id="paymentChannelId"
                  value={paymentChannelId}
                  onChange={(e) => setPaymentChannelId(e.target.value)}
                  placeholder="e.g. abcd-defg-hijk-lmno"
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="paymentAmount">Payment Amount</label>
                <input
                  type="text"
                  id="paymentAmount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  min="0"
                  max="1"
                  step="0.000000000000000000000001"
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="paymentEncoded">
                  <input
                    type="checkbox"
                    id="paymentEncoded"
                    className={styles.checkbox}
                    checked={paymentEncoded}
                    onChange={() => setPaymentEncoded(!paymentEncoded)}
                  />
                  Borsh+Base64 encode
                </label>
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {createPaymentError && <p className={styles.error}>{createPaymentError}</p>}
          </div>

          <div className={styles.card}>
            <h2>{"Get Channel"}</h2>
            <p>{functionDescriptions.get_channel}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setOpenChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setOpenChannelError("Not initialized");
                  return;
                }

                const result = await pcClient.pcClient.get_channel(getChannelChannelId);
                if (!result.ok) {
                  setGetChannelError(result.error.message);
                  return;
                }

                const channel = result.value;
                if (channel) {
                  setGetChannelError(`Channel:\n${JSON.stringify(channel.value, (_, value) =>
                    typeof value === 'bigint'
                        ? value.toString()
                        : value, 2)}`);
                } else {
                  setGetChannelError("Channel not found");
                }
              } catch (e: any) {
                setGetChannelError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="getChannelChannelId">Channel ID</label>
                <input
                  type="text"
                  id="getChannelChannelId"
                  value={getChannelChannelId}
                  onChange={(e) => setGetChannelChannelId(e.target.value)}
                  placeholder="e.g. abcd-defg-hijk-lmno"
                  required
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {getChannelError && <p className={styles.error}>{getChannelError}</p>}
          </div>

        </div>
      )}
    </main>
  );
}
