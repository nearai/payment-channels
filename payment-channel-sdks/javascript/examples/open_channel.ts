// node script to open a payment channel

import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node";
import { PaymentChannelClient } from "../src/client";
import { Account } from "../src/types";

const keystore = new UnencryptedFileSystemKeyStore(
  require("os").homedir() + "/.near-credentials"
);
const client = new PaymentChannelClient(keystore);

(async () => {
  const account_id = "...";
  const key = await keystore.getKey("mainnet", account_id);
  const public_key = key.getPublicKey().toString();
  const account = new Account({
    account_id,
    public_key,
  });

  const channel = await client.open_channel(account, account, BigInt(1));
  console.log(channel);
})();
