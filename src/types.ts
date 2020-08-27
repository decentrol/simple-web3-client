import { TransactionReceipt as _TransactionReceipt } from "web3-core";
import { AbiItem } from "web3-utils";

export interface ContractMethod {
  name: string;
  signature: string;
  address: string;
  abi: AbiItem[];
  method: AbiItem | null;
}

export interface TransactionReceipt extends _TransactionReceipt {
  revertReason: string | undefined;
}

export type network = "mainnet" | "kovan" | "goerli" | "ropsten" | "rinkeby";
