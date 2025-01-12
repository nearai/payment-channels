# Payment Channel SDKs

supports rust, javascript, python

## Core structs / methods

- `PublicKey (Enum { array[u8, 32], other })`
- `ChannelId (string)`
- `Account`
- `Channel`
- `State`
- `SignedState`

- `PaymentChannelClient (static singleton)`
  - `set_contract_address(address = 'payment_channel.near') -> Self`
  - `open_channel(account: Account, channel_id: Optional[ChannelId] = None) -> Channel`
  - `close_channel(signer: Account, channel_id: ChannelId, provider_close: SignedState)`
  - `start_force_close_channel(signer: Account, channel_id: ChannelId)`
  - `finish_force_close_channel(signer: Account, channel_id: ChannelId)`
  - `topup(signer: Account, channel_id: ChannelId, amount: int) -> Channel`
  - `create_payment(signer: Account, channel_id: ChannelId, amount: int) -> SignedState`
  - `create_close_channel_message(signer: Account, channel_id: ChannelId) -> SignedState`
  - `withdraw(signer: Account, channel_id: ChannelId, payment: SignedState)`
  - `get_channel(channel_id: ChannelId) -> Channel`
  - `list_channels() -> List[Channel]`

  - `export() -> PaymentChannelExport`
  - `import(export: PaymentChannelExport) -> Self`

* `PaymentChannelClient` will have it's own local storage.