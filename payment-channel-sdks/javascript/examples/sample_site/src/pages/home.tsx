import {useState, useEffect } from 'react';
import { useSignedAccountId, usePaymentChannelClient, useWalletSelector } from '../near';
import { Account, NearToken, SignedState} from "near-payment-channel-sdk";
import { Buffer } from "buffer";

// @ts-ignore
import styles from '../styles/app.module.css';
import { getProviderByNetwork } from '@near-js/client';
import { AccountView } from '@near-js/types';

const functionDescriptions = {
  open_channel: "Create a new payment channel between sender and receiver. This method should be called by the sender.",
  create_payment: "Create a new payment within an existing channel. This method should be called by the sender.",
  close_channel: "Close an existing payment channel. This method should be called by the receiver.",
  start_force_close_channel: "Initiate forced closure of a channel. This method should be called by the sender.",
  finish_force_close_channel: "Complete forced closure of a channel. This method should be called by the sender.",
  topup: "Add funds to an existing channel. This method should be called by the sender.",
  withdraw: "Withdraw funds from a channel. This method should be called by the receiver.",
  get_channel: "Get details of a specific channel. This method should be called by the sender or receiver.",
  list_channels: "View all available channels. This method should be called by the sender or receiver."
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
  const [receiverPublicKey, setReceiverPublicKey] = useState<string>("");
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

  // close channel
  const [closeChannelId, setCloseChannelId] = useState<string>("");
  const [closeChannelSignedState, setCloseChannelSignedState] = useState<string>("");
  const [closeChannelError, setCloseChannelError] = useState<string | null>("");

  // start force close channel state
  const [forceCloseChannelId, setForceCloseChannelId] = useState<string>("");
  const [forceCloseChannelError, setForceCloseChannelError] = useState<string | null>("");

  // finish force close channel state
  const [finishForceCloseChannelId, setFinishForceCloseChannelId] = useState<string>("");
  const [finishForceCloseChannelError, setFinishForceCloseChannelError] = useState<string | null>("");

  // list known channels
  const [listChannelsError, setListChannelsError] = useState<string | null>("");

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

                const receiver = new Account({
                  account_id: receiverAccountId,
                  public_key: receiverPublicKey
                })
                const deposit = NearToken.parse_near(amount);
                const result = await pcClient.pcClient.open_channel(accountId, receiver, deposit);
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
                <label htmlFor="receiverPublicKey">Receiver Public Key</label>
                <input
                  type="text"
                  id="receiverPublicKey"
                  value={receiverPublicKey}
                  onChange={(e) => setReceiverPublicKey(e.target.value)}
                  placeholder="e.g. ed25519:abcd..."
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
            <h2>{"Create Payment Payload"}</h2>
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
                const result = await pcClient.pcClient.create_payment(accountId, payment);
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
                <label htmlFor="paymentAmount">Payment Amount (in NEAR)</label>
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

          <div className={styles.card}>
            <h2>{"Close Channel"}</h2>
            <p>{functionDescriptions.close_channel}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setCloseChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setCloseChannelError("Not initialized");
                  return;
                }

                const decodedSignedState = Buffer.from(closeChannelSignedState, 'base64');
                // remove the first null byte, because ... reasons
                console.log("buff", Array.from(decodedSignedState));
                const signedState = SignedState.from_borsh(decodedSignedState);
                console.log("signedState", signedState);
                const closeChannelResult = await pcClient.pcClient.close(closeChannelId, signedState);
                if (!closeChannelResult.ok) {
                  setCloseChannelError(closeChannelResult.error.message);
                  return;
                }

                setCloseChannelError(`Closed channel with ID: ${closeChannelId}`);
              } catch (e: any) {
                setCloseChannelError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="closeChannelId">Channel ID</label>
                <input
                  type="text"
                  id="closeChannelId"
                  value={closeChannelId}
                  onChange={(e) => setCloseChannelId(e.target.value)}
                  placeholder="e.g. abcd-defg-hijk-lmno"
                  required
                  className={styles.input}
                />
                <label htmlFor="closeChannelSignedState">Close Channel Signed State (encoded)</label>
                <input
                  type="text"
                  id="closeChannelSignedState"
                  value={closeChannelSignedState}
                  onChange={(e) => setCloseChannelSignedState(e.target.value)}
                  placeholder="e.g. abcd..."
                  required
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {closeChannelError && <p className={styles.error}>{closeChannelError}</p>}
          </div>

          <div className={styles.card}>
            <h2>{"Start Force Close Channel"}</h2>
            <p>{functionDescriptions.start_force_close_channel}</p>
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

                const getChannelResult = await pcClient.pcClient.get_channel(forceCloseChannelId);
                if (!getChannelResult.ok) {
                  setForceCloseChannelError(getChannelResult.error.message);
                  return;
                }
                const channel = getChannelResult.value;
                if (!channel) {
                  setForceCloseChannelError("Channel not found");
                  return;
                }

                // ensure the current logged in user is the sender
                if (channel.value.sender.account_id !== signedAccountId.signedAccountId) {
                  setForceCloseChannelError("You are not the sender of this channel");
                  return;
                }

                const startForceCloseResult = await pcClient.pcClient.start_force_close(forceCloseChannelId);
                if (!startForceCloseResult.ok) {
                  setForceCloseChannelError(startForceCloseResult.error.message);
                  return;
                }

                setForceCloseChannelError(`Started force close channel with ID: ${forceCloseChannelId}`);
              } catch (e: any) {
                setForceCloseChannelError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="forceCloseChannelId">Channel ID</label>
                <input
                  type="text"
                  id="forceCloseChannelId"
                  value={forceCloseChannelId}
                  onChange={(e) => setForceCloseChannelId(e.target.value)}
                  placeholder="e.g. abcd-defg-hijk-lmno"
                  required
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {forceCloseChannelError && <p className={styles.error}>{forceCloseChannelError}</p>}
          </div>

          <div className={styles.card}>
            <h2>{"Finish Force Close Channel"}</h2>
            <p>{functionDescriptions.finish_force_close_channel}</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setFinishForceCloseChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setFinishForceCloseChannelError("Not initialized");
                  return;
                }

                const getChannelResult = await pcClient.pcClient.get_channel(forceCloseChannelId);
                if (!getChannelResult.ok) {
                  setFinishForceCloseChannelError(getChannelResult.error.message);
                  return;
                }
                const channel = getChannelResult.value;
                if (!channel) {
                  setFinishForceCloseChannelError("Channel not found");
                  return;
                }

                // ensure the current logged in user is the sender
                if (channel.value.sender.account_id !== signedAccountId.signedAccountId) {
                  setFinishForceCloseChannelError("You are not the sender of this channel");
                  return;
                }

                const finishForceCloseResult = await pcClient.pcClient.finish_force_close(forceCloseChannelId);
                if (!finishForceCloseResult.ok) {
                  setFinishForceCloseChannelError(finishForceCloseResult.error.message);
                  return;
                }

                setFinishForceCloseChannelError(`Started force close channel with ID: ${forceCloseChannelId}`);
              } catch (e: any) {
                setFinishForceCloseChannelError(e.message);
              }
            }}>
              <div className={styles.formGroup}>
                <label htmlFor="finishForceCloseChannelId">Channel ID</label>
                <input
                  type="text"
                  id="finishForceCloseChannelId"
                  value={finishForceCloseChannelId}
                  onChange={(e) => setFinishForceCloseChannelId(e.target.value)}
                  placeholder="e.g. abcd-defg-hijk-lmno"
                  required
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {finishForceCloseChannelError && <p className={styles.error}>{finishForceCloseChannelError}</p>}
          </div>

          <div className={styles.card}>
            <h2>{"List Known Channels (localstorage)"}</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!walletSelector || !walletSelector || !pcClient || !signedAccountId) {
                  setFinishForceCloseChannelError("Not logged in");
                  return;
                }
                if (!walletSelector.walletSelector || !pcClient.pcClient) {
                  setFinishForceCloseChannelError("Not initialized");
                  return;
                }

                const listChannelsResult = await pcClient.pcClient.list_channels(true);
                if (!listChannelsResult.ok) {
                  setListChannelsError(listChannelsResult.error.message);
                  return;
                }
                const channels = listChannelsResult.value;
                if (!channels) {
                  setListChannelsError("No channels found");
                  return;
                }

                const channelIds = Array.from(channels.map((channel) => channel.id));
                setListChannelsError(`Channel IDs: ${JSON.stringify(channelIds, (_, value) =>
                  typeof value === 'bigint'
                      ? value.toString()
                      : value, 2)}`);
              } catch (e: any) {
                setListChannelsError(e.message);
              }
            }}>
              <button type="submit" className={styles.button}>Execute</button>
            </form>
            {listChannelsError && <p className={styles.error}>{listChannelsError}</p>}
          </div>

        </div>
      )}
    </main>
  );
}
