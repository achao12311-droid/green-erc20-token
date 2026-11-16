import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ecoWallet } from "./ecoWallet";

export const config = createConfig({
  chains: [sepolia],
  connectors: [ecoWallet()],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined),
  },
});
