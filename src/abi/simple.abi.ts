import { AbiItem } from "web3-utils";

export default [
  {
    inputs: [],
    name: "getCalls",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "num",
        type: "uint256",
      },
    ],
    name: "testNumber",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as AbiItem[];
