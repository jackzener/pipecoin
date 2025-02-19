# PIPE Protocol Smart Contracts

This repository contains the core smart contracts for the PIPE Protocol, a programmable market for knowledge and creativity that proposes a new way to capture value derived from ownership and exclusivity.

## Overview

The PIPE Protocol introduces a novel approach to transforming copyrights, trademarks, and patents into audience engagement, brand influence, and content reach. This repository contains two main contracts:

### PipeCoin ($pIPe)

An ERC20 token with permit functionality that serves as the native token of the PIPE ecosystem. Key features:
- Total Supply: 420,069,000,000,000 tokens
- 18 decimals
- Permit functionality for gasless approvals
- Initial distribution to treasury

### PipePresale

A phased token presale contract with support for both IP and USDC payments. Features:
- 8 price phases with increasing prices
- Support for IP and USDC payments (using permit)
- Anti-contract protection
- Phase management system
- Claim mechanism for purchased tokens

## Token Distribution

The total token supply is distributed as follows:
- Presale: 20%
- Crowdfunded Distribution: 65%
- Team: 15%

## Presale Details

The presale will occur between February 17th and March 31st, 2025. Features:
- 8 phases with increasing prices
- Support for both ETH and USDC payments
- Tokens are locked until presale ends
- Claiming enabled after presale completion

## Requirements

- Node.js 12.x or later
- Hardhat
- OpenZeppelin Contracts 4.x

## Installation

```bash
npm install
```

## Usage

### Deploy Contracts

```bash
npx hardhat run scripts/deploy.js --network <network>
```

### Run Tests

```bash
npx hardhat test
```

## Documentation

For more detailed information about the PIPE Protocol, visit:
- Website: https://www.pipecoin.meme/
- Whitepaper: https://www.pipecoin.meme/pIPe_whitepaper.pdf

## Security

These contracts have been designed with security best practices in mind. However, please note:
- Smart contracts may contain bugs despite best efforts
- Use at your own risk
- Perform your own security assessment before using

## Disclaimer

$pIPe is entirely for entertainment and educational purposes only. It is not designed to be:
- A medium of exchange
- Payment for goods or services
- A representation of any financial instrument
- A security or investment product

For full disclaimer, please refer to the whitepaper.

## License

MIT License. See [LICENSE](./LICENSE) for details.

## Development Team

The PIPE Protocol is developed by a team of degens focused on maintaining the platform's technical functionality. Note that they reserve the right to discontinue their work without prior notice.

## Contributing

We welcome contributions to improve the protocol. Please submit issues and pull requests or reach out to the team through official channels.
