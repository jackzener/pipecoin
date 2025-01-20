# PipeCoin Ecosystem

This project implements a comprehensive token ecosystem, including a meme coin (MemeCoin), a primary token (PipeCoin), a swapping mechanism, and a staking system.

# Deploy 

- Deploy All

```
npx hardhat run scripts/deploy/deploy.js --network story_odyssey
```

- Deploy Staking Contract

```
npx hardhat run scripts/deploy/deployStakingContract.js --network story_odyssey
```

- Deploy Presale Contract

```
npx hardhat run scripts/deploy/deployPresaleContract.js --network story_odyssey
````

## Contracts

Deployment Addresses (Odyssey):

PipeCoin: 0x5d26AED76E8a5ddb7Fdb4c9d2F973ED62D2381BC
PipeStaking: 0x1Cdd429f077f04067CdCD6433415fb695B3Be614
PipeCoinAirdrop: 0xb8015084C99ecF9498B4Be945cB6EAE1598d3b05
IPFaucet: 0x05ae73DCB8FaBE50EbcaD21D7B4FAD6AF666f46A
presale: '0xcAFd4da6F4A94F9830d963f8253FC54C4b7956Ed',
usdc: '0xF1815bd50389c46847f0Bda824eC8da914045D14',
fundingWallet: '0x965A039859a52A33912cD9Acd75c37F9BC8B34E7'

### 1. MemeCoin

A standard ERC20 token with a total supply of 420.69 billion tokens.

- **File**: `MemeCoin.sol`
- **Total Supply**: 420,690,000,000 tokens (with 18 decimals)
- **Distribution**:
  - 90% to treasury
  - 10% to swapper

### 2. PipeCoin

The primary ERC20 token of the ecosystem.

- **File**: `PipeCoin.sol`
- **Total Supply**: 420,690,000,000 tokens (with 18 decimals)
- **Distribution**:
  - 50% to swapper
  - 30% to staking contract
  - 20% to treasury

### 3. AirDrop

This contract manages the airdrop

- **File**: `PipeCoinAirdrop.sol`

- Download a snapshot here `https://odyssey.storyscan.xyz/csv-export?type=holders&address=0x5d26AED76E8a5ddb7Fdb4c9d2F973ED62D2381BC`
- Rename it to `airdrop-list.csv` and put it in the `/scripts/data/` folder
- Run the following command:
```
npx hardhat run scripts/airdrop.js --network story_odyssey
```

### 4. PipeStaking

Enables users to stake their PipeCoin (pIPe) tokens and earn rewards.

- **File**: `PipeStaking.sol`
- **Annual Reward Rate**: 10%

## Setup and Deployment

1. There are individual deployment scripts:

- PipeCoin

```
npx hardhat run scripts/deploy/deployPipeCoinContracts.js --network <Choose Network>
```

- Presale

```
npx hardhat run scripts/deploy/deployPresaleContracts.js --network <Choose Network>
```

Possible networks are `localhost`, `story_odyssey` and `story` 

## Usage

## Security Considerations

- All contracts use OpenZeppelin's standard implementations for security
- ReentrancyGuard is implemented in relevant contracts to prevent reentrancy attacks
- Ownership controls are in place for administrative functions

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Compile contracts: `npx hardhat compile`
4. Run tests: `npx hardhat test`

## Testing

### Unit Tests:

```
npm run test:unit 
```

### Integration Tests:

- Local 

```
npm run test:integration 
```

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.

## License

This project is licensed under the MIT License.