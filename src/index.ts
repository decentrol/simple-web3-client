import Web3 from "web3";
import * as ethers from "ethers";
import { ContractMethod, TransactionReceipt, network } from "./types";
import { findInABI } from "./ContractMethods";

export default class Web3Service {
  public static instance: Web3Service;

  public web3Instance!: Web3;
  public address!: string;

  protected pendingTransactions: string[] = [];

  public static getInstance() {
    if (!Web3Service.instance) {
      Web3Service.instance = new Web3Service();
    }
    return Web3Service.instance;
  }

  private constructor() {}

  public init(provider: string | null) {
    this.web3Instance = new Web3(provider);
  }

  public async call<T extends string>(method: ContractMethod, ...args: any[]) {
    try {
      const data = this.encodeMethod(method, ...(args || []));

      const result = await this.web3Instance.eth.call({
        to: method.address,
        data: data,
      });
      if (result === "0x") {
        return null;
      }
      const decoded = this.decodeOutput<T>(method, result);
      return decoded;
    } catch (err) {
      // TODO: Check for VM-errors
      throw err;
    }
  }

  public async transaction(
    from: string,
    method: ContractMethod,
    ...args: any[]
  ): Promise<string> {
    let resultHash: string | undefined = undefined;
    const data = this.encodeMethod(method, ...args);
    const tx = {
      from,
      to: method.address,
      data,
    };
    try {
      const gas = await this.web3Instance.eth.estimateGas(tx);
      this.web3Instance.eth
        .sendTransaction({
          ...tx,
          gas,
        })
        .on("transactionHash", (hash) => {
          resultHash = hash;
        })
        .on("error", (error) => {
          throw error;
        });

      while (true) {
        if (!resultHash) continue;
        this.pendingTransactions.push(resultHash);
        return resultHash as string;
      }
    } catch (err) {
      throw err;
    }
  }

  public async getReceipt(txId: string): Promise<TransactionReceipt> {
    try {
      while (true) {
        const receipt = await this.web3Instance.eth.getTransactionReceipt(txId);
        if (!receipt) continue;
        let revertReason: string | undefined = undefined;
        if (receipt.status === false) {
          revertReason = await this.getRevertReason(
            receipt.transactionHash,
            "ropsten"
          );
        }
        this.pendingTransactions = this.pendingTransactions.filter(
          (tx) => tx !== txId
        );
        return { ...receipt, revertReason };
      }
    } catch (err) {
      throw err;
    }
  }

  protected decodeOutput<T extends string>(
    method: ContractMethod,
    output: string
  ) {
    const AbiItem = findInABI(method.name, method.abi);
    if (!AbiItem.outputs) {
      throw new Error("No outputs in ABI");
    }
    const AbiInputs = AbiItem.outputs.map((o) => ({
      name: o.name,
      type: o.type,
    }));

    return this.web3Instance.eth.abi.decodeParameters(AbiInputs, output) as {
      [index in T]: any;
    };
  }

  protected encodeMethod(method: ContractMethod, ...args: any[]): string {
    if (!args.length) {
      return this.web3Instance.eth.abi.encodeFunctionSignature(
        method.signature
      );
    }
    const abiItem = findInABI(method.name, method.abi);
    return this.web3Instance.eth.abi.encodeFunctionCall(abiItem, args);
  }

  /**
   * Title: eth-revert-reason
   * Author: Shane Fontaine (https://github.com/shanefontaine)
   * Date: 2020
   * Code Version: 1.0.3
   * Availability: https://github.com/authereum/eth-revert-reason
   */

  protected async getRevertReason(
    txHash: string,
    network: network = "mainnet",
    blockNumber: string | undefined = undefined
  ) {
    ({ network, blockNumber } = this.normalizeInput(network, blockNumber));

    await this.validateInputPreProvider(txHash, network);
    const provider = this.getProvider(network);
    await this.validateInputPostProvider(
      txHash,
      network,
      blockNumber,
      provider
    );

    try {
      const tx = await provider.getTransaction(txHash);
      const code = await this.getCode(tx, network, blockNumber, provider);
      return this.decodeMessage(code, network);
    } catch (err) {
      throw new Error("Unable to decode revert reason.");
    }
  }

  private normalizeInput(network: network, blockNumber: string | undefined) {
    return {
      network: network.toLowerCase() as network,
      blockNumber: blockNumber || "latest",
    };
  }

  private async validateInputPreProvider(txHash: string, network: network) {
    // Only accept a valid txHash
    if (
      !/^0x([A-Fa-f0-9]{64})$/.test(txHash) ||
      txHash.substring(0, 2) !== "0x"
    ) {
      throw new Error("Invalid transaction hash");
    }

    const networks = ["mainnet", "kovan", "goerli", "ropsten", "rinkeby"];
    if (!networks.includes(network)) {
      throw new Error("Not a valid network");
    }
  }

  private getProvider(network: network) {
    // If a web3 provider is passed in, wrap it in an ethers provider
    // A standard web3 provider will have `.version`, while an ethers will not

    return ethers.getDefaultProvider(network);
  }

  private async validateInputPostProvider(
    txHash: string,
    network: network,
    blockNumber: string | number,
    provider: ethers.ethers.providers.BaseProvider
  ) {
    // NOTE: Unless the node exposes the Parity `trace` endpoints, it is not possible to get the revert
    // reason of a transaction on kovan. Because of this, the call will end up here and we will return a custom message.
    if (network === "kovan") {
      try {
        const tx = await provider.getTransaction(txHash);
        this.getCode(tx, network, blockNumber, provider);
      } catch (err) {
        throw new Error(
          "Please use a provider that exposes the Parity trace methods to decode the revert reason."
        );
      }
    }

    // Validate the block number
    if (blockNumber !== "latest") {
      const currentBlockNumber = await provider.getBlockNumber();
      blockNumber = Number(blockNumber);

      if (blockNumber >= currentBlockNumber) {
        throw new Error(
          "You cannot use a blocknumber that has not yet happened."
        );
      }

      // A block older than 128 blocks needs access to an archive node
      if (blockNumber < currentBlockNumber - 128) {
        try {
          // Check to see if a provider has access to an archive node
          await provider.getBalance(ethers.constants.AddressZero, blockNumber);
        } catch (err) {
          const errCode = JSON.parse(err.responseText).error.code;
          // NOTE: This error code is specific to Infura. Alchemy offers an Archive node by default, so an Alchemy node will never throw here.
          const infuraErrCode = -32002;
          if (errCode === infuraErrCode) {
            throw new Error(
              "You cannot use a blocknumber that is older than 128 blocks. Please use a provider that uses a full archival node."
            );
          }
        }
      }
    }
  }

  private decodeMessage(code: string, network: network) {
    // NOTE: `code` may end with 0's which will return a text string with empty whitespace characters
    // This will truncate all 0s and set up the hex string as expected
    // NOTE: Parity (Kovan) returns in a different format than other clients
    let codeString;
    const fnSelectorByteLength = 4;
    const dataOffsetByteLength = 32;
    const strLengthByteLength = 32;
    const strLengthStartPos =
      2 + (fnSelectorByteLength + dataOffsetByteLength) * 2;
    const strDataStartPos =
      2 +
      (fnSelectorByteLength + dataOffsetByteLength + strLengthByteLength) * 2;

    if (network === "kovan") {
      const strLengthHex = code
        .slice(strLengthStartPos)
        .slice(0, strLengthByteLength * 2);
      const strLengthInt = parseInt(`0x${strLengthHex}`, 16);
      const strDataEndPos = strDataStartPos + strLengthInt * 2;
      if (codeString === "0x") return "";
      codeString = `0x${code.slice(strDataStartPos, strDataEndPos)}`;
    } else {
      codeString = `0x${code.substr(138)}`.replace(/0+$/, "");
    }

    // If the codeString is an odd number of characters, add a trailing 0
    if (codeString.length % 2 === 1) {
      codeString += "0";
    }

    return ethers.utils.toUtf8String(codeString);
  }

  private async getCode(
    tx: ethers.ethers.utils.Deferrable<
      ethers.ethers.providers.TransactionRequest
    >,
    network: network,
    blockNumber: string | number,
    provider: ethers.ethers.providers.BaseProvider
  ) {
    if (network === "kovan") {
      try {
        // NOTE: The await is intentional in order for the catch to work
        return await provider.call(tx, blockNumber);
      } catch (err) {
        return JSON.parse(err.responseText).error.data.substr(9);
      }
    } else {
      return provider.call(tx, blockNumber);
    }
  }
  /** END CREDITS */
}
