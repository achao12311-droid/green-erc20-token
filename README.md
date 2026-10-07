# EcoToken

## Introduction

EcoToken (ECO) is an ERC-20 you can send, receive, and stake. It is built for people who want a coin supply tied to a measured record instead of an open-ended mint.

The supply is capped at 1,000,000 ECO. After deployment, new coins are created only through `mintWithAttestation`: the attester signs a record, and the contract mints 1 ECO for every 1,000 grams in that record. The same record cannot be used twice, and the caller cannot pick a larger amount than the grams allow. Transfers cannot be paused, so the owner cannot freeze a balance. The attester role moves only through two-step ownership.

`produceBlock()` keeps a height, timestamp, and producer inside this contract once a minute. That log does not mint ECO, and it does not add blocks to Ethereum. The contract checks the signature, the unique record id, and the cap. The meaning of the grams comes from the public record that matches `actionId`.

## Supply rules

ECO is a token you can send and receive. Total supply cannot pass 1,000,000 ECO. New coins are minted only when the attester signs a record of measured grams. 1,000 grams mint 1 ECO. The caller does not choose the amount.

`produceBlock()` stores a height, timestamp, and producer inside this contract. It does not mint ECO, and it does not add blocks to Ethereum.

## Send and receive

`transfer(to, amount)` sends your ECO to someone else.

To let someone else pull ECO, call `approve(spender, amount)`. They then call `transferFrom(you, recipient, amount)`. A signature approval (`permit`) is also available; a normal `approve` is enough.

## Signed mint

`mintWithAttestation(to, actionId, grams, nonce, signature)` mints to `to`.

The signature is an Ethereum signed message over `keccak256(abi.encode(token, to, actionId, grams, nonce))`. The signer must be `attester()`, which is the current owner. The same `actionId` cannot be used twice. A mint that would pass `MAX_SUPPLY` reverts with `MaxSupplyExceeded`.

The public record for that `actionId` is what gives the grams a meaning. The contract checks the signature, the unique id, and the cap.

Giving the attester role to someone else takes two steps: `transferOwnership`, then the new owner calls `acceptOwnership`. Until then, the previous attester still signs.

## Stake

`stake(amount)` locks your ECO in the contract. Locked tokens are not in your transferable balance.

`unstake(amount)` returns that many to your transferable balance.

You need a nonzero stake to call `produceBlock()`. After you unstake all of it, you cannot produce a block until you stake again. Producing a block does not change anyone's balance.

## Blocks every minute

The first block can be produced right after deploy. The contract starts its clock 60 seconds in the past so that call is not early. Every later block must wait until `block.timestamp >= lastBlockTime + 60`. Calling sooner reverts with `BlockTooEarly`. Calling with no stake reverts with `NoStake`.

## Run the tests

```bash
cd green-erc20-token
npm install
npx hardhat test
```

The tests move the chain clock forward. They do not wait a real minute, and they do not deploy to a live network.

Transfers cannot be paused. The owner cannot freeze a balance.
