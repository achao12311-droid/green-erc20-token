# EcoToken

## Introduction

EcoToken (ECO) is an ERC-20 you can send, receive, and stake. Supply is capped at 1,000,000 ECO. New coins are minted only when the attester signs a record of measured grams: 1,000 grams mint 1 ECO. The caller does not choose the amount. The same record cannot be used twice. Transfers cannot be paused, so the owner cannot freeze a balance. The attester changes only after `transferOwnership` and `acceptOwnership`.

## Published record

The measurement for action 1 is in [records/action-1.csv](records/action-1.csv).

| actionId | grams | ECO minted |
| --- | --- | --- |
| 1 | 5 | 0.005 |

`records/action-1.csv` is the record. `records/action-1-method.txt` says how the grams were calculated: one A4 sheet at 80 grams per square metre is 4.9896 grams, stored as 5 whole grams. The test `mints the published gram record` signs that row and checks that the contract mints 0.005 ECO. This computer has no scale, so this is a paper-size calculation, not a scale reading.

## Send and receive

`transfer(to, amount)` sends your ECO to someone else.

To let someone else pull ECO, call `approve(spender, amount)`. They then call `transferFrom(you, recipient, amount)`. A signature approval (`permit`) is also available; a normal `approve` is enough.

## Signed mint

`mintWithAttestation(to, actionId, grams, nonce, deadline, signature)` mints to `to`.

The attester signs EIP-712 typed data, type `Mint(address to,uint256 actionId,uint256 grams,uint256 nonce,uint256 deadline)`, for the EcoToken domain on this chain. A wallet shows those fields before signing. The signature is tied to this contract and chain id, and it is rejected after `deadline`. The signer must be `attester()`, which is the current owner. A mint that would pass `MAX_SUPPLY` reverts with `MaxSupplyExceeded`. A mint to the token contract itself reverts with `MintToContract`.

## Stake

`stake(amount)` locks your ECO in the contract. Locked tokens are not in your transferable balance.

`unstake(amount)` returns that many to your transferable balance.

## Run the tests

```bash
cd green-erc20-token
npm install
npx hardhat test
```

The tests sign the published record locally. They do not deploy to a live network.

## Sepolia

This repository does not include a private key. To deploy, copy `.env.example` to `.env`, set `SEPOLIA_RPC_URL` and `PRIVATE_KEY`, then run:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

No Sepolia address is listed here yet, because those two values were not set.
