declare global {
  interface Window {
    Jupiter: JupiterPlugin;
  }

  interface Navigator {
    wallets?: any[];
  }
}

interface JupiterPlugin {
  init: (config: JupiterConfig) => void;
  syncProps?: (props: any) => void;
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
  passthroughWalletContextState?: any;
  onRequestConnectWallet?: () => void | Promise<void>;
  platformFeeAndAccounts?: {
    feeBps: number;
    feeAccounts: any;
  };
}

export {};
