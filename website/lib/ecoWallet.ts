import { createConnector } from "wagmi";
import { getAddress, numberToHex, type Address } from "viem";

const bridgeUrl = "http://127.0.0.1:3939";

type RpcArgs = { method: string; params?: unknown };

async function rpc(args: RpcArgs) {
  let response: Response;
  try {
    response = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: args.method, params: args.params ?? [] }),
    });
  } catch {
    throw new Error("請先打開 ECO Wallet 並解鎖。");
  }
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "ECO Wallet 拒絕了這次操作。");
  return body.result;
}

function asAddresses(value: unknown): readonly Address[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => getAddress(item));
}

export function ecoWallet() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const provider = {
    async request(args: RpcArgs) {
      return rpc(args);
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const group = listeners.get(event) ?? new Set();
      group.add(listener);
      listeners.set(event, group);
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
  };

  return createConnector((config) => ({
    id: "ecoWallet",
    name: "ECO Wallet",
    type: "ecoWallet",
    async setup() {},
    connect: (async (parameters?: { withCapabilities?: boolean }) => {
      const accounts = asAddresses(await provider.request({ method: "eth_requestAccounts" }));
      const chainId = Number(await provider.request({ method: "eth_chainId" }));
      return parameters?.withCapabilities
        ? { accounts: accounts.map((address) => ({ address, capabilities: {} })), chainId }
        : { accounts, chainId };
    }) as {
      <withCapabilities extends boolean = false>(parameters?: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      }): Promise<{
        accounts: withCapabilities extends true
          ? readonly { address: Address; capabilities: Record<string, unknown> }[]
          : readonly Address[];
        chainId: number;
      }>;
    },
    async disconnect() {
      await provider.request({ method: "eco_disconnect" }).catch(() => undefined);
    },
    async getAccounts() {
      return asAddresses(await provider.request({ method: "eth_accounts" }));
    },
    async getChainId() {
      return Number(await provider.request({ method: "eth_chainId" }));
    },
    async isAuthorized() {
      try {
        return (await this.getAccounts()).length > 0;
      } catch {
        return false;
      }
    },
    async switchChain({ chainId }) {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(chainId) }] });
      const chain = config.chains.find((item) => item.id === chainId);
      if (!chain) throw new Error("ECO Wallet 只使用 Sepolia。");
      return chain;
    },
    async getProvider() {
      return provider;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
