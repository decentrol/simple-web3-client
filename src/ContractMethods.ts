import { AbiItem } from "web3-utils";
import { ContractMethod } from "./types";

export class ContractMethods {
  static removeMe: ContractMethod;
}

export const findInABI = function (name: string, abi: AbiItem[]) {
  const ABI = abi.find((current) => {
    return current.name === name;
  });
  if (!ABI) {
    throw "No ABI found";
  }
  return ABI;
};
