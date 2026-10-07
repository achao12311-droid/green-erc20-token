# EcoToken

## Introduction

EcoToken (ECO) is an ERC-20 you can send, receive, and stake. Supply is capped at 1,000,000 ECO. New coins are minted only when the attester signs a record of measured grams: 1,000 grams mint 1 ECO. The caller does not choose the amount. The same record cannot be used twice. Transfers cannot be paused, so the owner cannot freeze a balance. The attester changes only after `transferOwnership` and `acceptOwnership`.

## Published record

The measurement for action 1 is in [records/action-1.csv](records/action-1.csv).

| actionId | grams | ECO minted |
| --- | --- | --- |
| 1 | 5000 | 5 |

`records/action-1.csv` is the record. The test `mints the published gram record` signs that row and checks that the contract mints 5 ECO. Replace the grams in that file with your own measurement before you treat the number as a field result.

## Send and receive

`transfer(to, amount)` sends your ECO to someone else.

To let someone else pull ECO, call `approve(spender, amount)`. They then call `transferFrom(you, recipient, amount)`. A signature approval (`permit`) is also available; a normal `approve` is enough.

## Signed mint

`mintWithAttestation(to, actionId, grams, nonce, signature)` mints to `to`.

The signature is an Ethereum signed message over `keccak256(abi.encode(token, to, actionId, grams, nonce))`. The signer must be `attester()`, which is the current owner. A mint that would pass `MAX_SUPPLY` reverts with `MaxSupplyExceeded`.

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
