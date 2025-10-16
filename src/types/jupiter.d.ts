declare global {
  interface Window {
    Jupiter: JupiterPlugin;
  }

  interface Navigator {
    wallets?: WalletAdapter[];
  }
}

interface WalletAdapter {
  name: string;
  url: string;
  icon: string;
  readyState: string;
}

interface JupiterPlugin {
  init: (config: JupiterConfig) => void;
  syncProps?: (props: Record<string, unknown>) => void;
  resume?: () => void;
}

interface JupiterConfig {
  displayMode: "widget" | "modal" | "integrated";
  integratedTargetId?: string;
  endpoint?: string;
  strictTokenList?: boolean;
  defaultExplorer?: string;
  formProps?: {
    initialAmount?: string;
    initialInputMint?: string;
    initialOutputMint?: string;
    swapMode?: "ExactInOrOut" | "ExactIn" | "ExactOut";
    fixedInputMint?: boolean;
    fixedOutputMint?: boolean;
    fixedAmount?: boolean;
    initialSlippageBps?: number;
  };
  containerStyles?: React.CSSProperties;
  containerClassName?: string;
  enableWalletPassthrough?: boolean;
  passthroughWalletContextState?: Record<string, unknown>;
  onRequestConnectWallet?: () => void | Promise<void>;
  platformFeeAndAccounts?: {
    feeBps: number;
    feeAccounts: Record<string, unknown>;
  };
}

export {};