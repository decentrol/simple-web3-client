# simple-web3-client
Super simple OOP Web3JS client. I just wanted to make transactions and calls to a contract, without all the hassle of web3.eth.Contract. 


## setup

Install all dependencies
`yarn install`

If you don't have it yet, install typescript
`yarn add -g typescript`

compile to typescript
`tsc`

CommonJS files are in dist folder

## How to use it
Contract methods are in the `ContractMethods.ts` file.

Add contract methods to it, for example

`static balanceOf: ContractMethod = {name: 'balanceOf', signature: 'balanceOf(address)', address: '0x00000', abi: abiObject, method: null`

then just use it by `Web3Service.getInstance().init(optionalProvider)`.
The web3Instance object is public, so you can still use all normal web3 functions.

