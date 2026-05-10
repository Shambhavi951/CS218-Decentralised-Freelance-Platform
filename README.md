# ChainWork — Decentralised Freelance Platform

A blockchain-based freelance marketplace built using Ethereum smart contracts. The platform allows freelancers to offer services and clients to hire freelancers securely using escrowed ETH payments. Payments are released only after successful completion confirmation, ensuring trustless transactions between both parties.

---

## Team Members

| **Name** | **Roll Number** |
|---|---|
| Devanshi Mahto | 240001023 |
| Priyanshi Mahto | 240002057 |
| Vaishnavi Ventrapragada | 240002078 |
| Shambhavi S Vijay | 240041034 |
| Usepetla Nancy Sahithi | 240001075 |
| Sudhiksha Vijayagiri | 240001079 |

---

## Technology Stack

| **Component** | **Technology** |
|---|---|
| Blockchain Layer | Solidity (EVM-compatible smart contracts) |
| Development Framework | Hardhat v2 |
| Blockchain Interaction | Ethers.js |
| Frontend Layer | React.js |
| Wallet Integration | MetaMask |
| Smart Contract Security | OpenZeppelin |
| Off-Chain Storage | IPFS (planned for future implementation) |
| Programming Languages | Solidity, JavaScript |

---

## Features

- Freelancer service listing
- Secure escrow-based hiring system
- ETH payment locking and release
- Reputation and rating system
- Auto-cancellation after inactivity
- Discount token proof-of-concept system
- MetaMask wallet integration
- Email-based off-chain communication
- Frontend integration with smart contracts
- OpenZeppelin security protections

---

## Setup Instructions

### Prerequisites

Make sure the following are installed:

- Node.js (v18+ recommended)
- npm
- Hardhat v2
- MetaMask browser extension
- Git

### Clone Repository

```bash
git clone <your-github-repository-link>
cd chainwork-decentralised-freelance-platform
```

### Install Dependencies

```bash
npm install
```

### Compile Smart Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Generate Coverage Report

```bash
npx hardhat coverage
```

### Deploy Smart Contracts

**Step 1 — Start Hardhat Local Network**

```bash
npx hardhat node
```

This starts a local Ethereum blockchain provided by Hardhat v2.

**Step 2 — Deploy Contract to Localhost**

Open a new terminal and run:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

### MetaMask Localhost Setup

**Add Hardhat Local Network to MetaMask**

Use the following network details:

| **Field** | **Value** |
|---|---|
| Network Name | Hardhat Localhost |
| RPC URL | http://127.0.0.1:8545 |
| Chain ID | 31337 |
| Currency Symbol | ETH |

**Import Test Account into MetaMask**

When you run:

```bash
npx hardhat node
```

Hardhat provides several test accounts with private keys.

Copy one of the private keys shown in the terminal and import it into MetaMask using:

> **MetaMask → Import Account → Paste Private Key**

This provides test ETH for interacting with the smart contracts locally.

> **Important Note:** This project has been tested on the Hardhat localhost network only. Public testnet deployment (Sepolia) has not been implemented or tested yet.

---

## Smart Contract Functionalities

### Freelancer Functions

- **`offerService()`** — Allows freelancers to list services with pricing and service details.

- **`submitWork()`** — Allows freelancers to submit completed work for client review.

- **`getFreelancerReputation()`** — Returns freelancer reputation information including:
  - Average rating
  - Total completed jobs
  - Weighted reputation score

- **`getClientReputation()`** — Returns client reputation information.

### Client Functions

- **`hireFreelancer()`** — Clients hire freelancers by depositing the exact ETH amount into escrow.

- **`confirmCompletion()`** — Client confirms successful work completion and releases ETH payment to the freelancer.

- **`submitFeedback()`** — Clients and freelancers can submit weighted feedback scores after completion.

- **`cancelJob()`** — Allows cancellation of inactive jobs with automatic refunds where applicable.

- **`autoRelease()`** — Automatically releases escrowed funds if the client remains inactive after the submission window.

---

## Security Features

- Reentrancy protection using **OpenZeppelin ReentrancyGuard**
- Input validation using **`require()` statements** and **custom errors**
- Access control restrictions for sensitive functions
- Safe ETH escrow handling
- Protection against double-rating
- Prevention of unauthorised payment release
- **Checks-Effects-Interactions (CEI)** pattern followed before ETH transfers

---

## Gas Optimisation

Significant engineering effort was applied to reduce on-chain transaction costs and improve smart contract efficiency. Multiple optimisation strategies were implemented throughout the project.

### Optimisation Techniques Used

**1. Tight Struct Packing**

The original contract used `uint256` for most variables, consuming an entire 32-byte storage slot per value.

The optimised implementation uses:
- `uint32` for IDs
- `uint88` for pricing values
- `uint64` for timestamps

This reduced unnecessary storage usage and lowered gas costs by packing multiple variables into fewer storage slots.

**2. Increment Logic Optimisation**

Counter increments were changed from:

```solidity
jobCount = jobCount + 1;
```

to:

```solidity
++jobCount;
```

This removes unnecessary temporary operations and provides small but consistent gas savings across repeated transactions.

**3. Custom Error Handling**

Long revert strings were replaced with Solidity custom errors.

Example:

```solidity
error UnauthorizedCaller();
```

instead of:

```solidity
require(condition, "Unauthorized caller");
```

Custom errors use compact 4-byte selectors and significantly reduce deployment and revert execution gas costs.

**4. Storage Caching**

Repeated storage reads were replaced with cached local references.

Example:

```solidity
Job storage j = jobs[jobId];
```

This reduced expensive `SLOAD` operations and improved execution efficiency in frequently used functions.

### Gas Optimisation Results

The following table compares average gas usage before and after optimisation:

| **Function** | **Old Avg Gas** | **New Avg Gas** | **Reduction** |
|---|---|---|---|
| hireFreelancer | 151,684 | 112,357 | ~25.9% |
| submitFeedback | 168,183 | 117,000 | ~30.4% |
| confirmCompletion | 312,733 | 257,874 | ~17.5% |
| submitWork | 95,074 | 59,175 | ~37.8% |
| offerService | 113,147 | 91,551 | ~19.1% |
| cancelJob | 63,678 | 50,535 | ~20.6% |

### Most Significant Optimisation

The largest improvement was achieved in the **`submitWork()`** function.

| | |
|---|---|
| **Before Optimisation** | 95,074 gas |
| **After Optimisation** | 59,175 gas |
| **Reduction** | ~37.8% gas reduction |

**Why the Optimisation Worked**

The optimisation reduced repeated storage reads, improved struct packing efficiency, and removed unnecessary memory operations. Since `submitWork()` interacts heavily with job state data, reducing storage overhead produced substantial gas savings.

### Gas Report Generation

Gas reports were generated using Hardhat v2 gas reporter tooling.

Command used:

```bash
npx hardhat test
```

Toolchain used: `hardhat-gas-reporter`

---

## Testing

The project includes comprehensive unit and integration tests for all core functionalities.

### Happy Path Tests

- Successful service listing
- Successful hiring flow
- Successful completion confirmation
- Correct ETH transfers
- Reputation calculations
- Discount token issuance and redemption

### Revert / Failure Tests

- Non-client attempting confirmation reverts
- Freelancer self-release attempts revert
- Double feedback submission reverts
- Invalid hiring attempts revert
- Hiring unavailable services reverts
- Invalid scores revert
- Unauthorized discount redemption reverts

### Time-Based Tests

- 7-day review window handling
- Auto-release after inactivity
- Discount token expiry validation

### Coverage

Smart contract test coverage was generated using the `solidity-coverage` plugin on Hardhat v2.

Command used:

```bash
npx hardhat coverage
```

**Coverage Results**

| **Metric** | **Coverage** |
|---|---|
| Statements | 100% |
| Branches | 92% |
| Functions | 100% |
| Lines | 100% |

Coverage reports were automatically generated in:

- `./coverage/`
- `./coverage.json`

> The project exceeds the required **70%+ line coverage** requirement.

---

## Frontend Features

- MetaMask wallet connection
- Smart contract ABI integration
- Real-time contract state display
- Hiring freelancers directly from UI
- Transaction status feedback
- Service browsing interface
- User profile creation with email support for off-chain communication between clients and freelancers

---

## On-Chain vs Off-Chain Data

### Stored On-Chain

- Freelancer wallet addresses
- Client wallet addresses
- Service pricing
- Job statuses
- Ratings
- Escrow balances
- Discount token ownership
- Reputation metrics

### Stored Off-Chain

- Email/contact information
- Service descriptions
- Portfolio files
- Chat and communication
- Future IPFS metadata

---

## Future Improvements

**1. Fully Functional Discount Token Economy**

A discount token reward system has already been implemented as a proof-of-concept. Currently, the tokens do not hold any real monetary value or redemption mechanism.

Future versions will integrate an economic incentive model where:
- Malicious users are penalised through a slashing mechanism
- Slashed ETH is collected into a shared reward pool
- Token value is dynamically backed by the total slashed amount

Proposed valuation model:

> **1 Discount Token = Total Slashed ETH / Total Tokens in Circulation**

This converts platform reputation and honest participation into tangible financial incentives.

**2. Integrated Decentralised Chat System**

The current platform already allows users to add email addresses to their profiles for off-chain communication.

Future versions aim to replace external communication methods with a fully integrated decentralised chat system inside the platform itself.

Planned features include:
- End-to-end encrypted messaging
- Client-freelancer negotiation before hiring
- Real-time communication within the DApp
- Off-chain message storage with on-chain verification if required

This removes dependency on third-party communication tools.

**3. Fraud Detection and Slashing**

Future smart contracts may detect malicious behaviour such as:
- Fake reviews
- Repeated cancellations
- Coordinated abuse attempts

Malicious users may then be penalised through automated slashing mechanisms.

**4. Decentralised Dispute Resolution**

A decentralised governance-based arbitration mechanism can be introduced to resolve freelancer-client disputes without a central authority.

---

## Known Issues / Limitations

- The discount token system is currently a proof-of-concept and is not yet financially backed.
- Token rewards currently have no redeemable monetary value.
- Slashing-based token valuation has not yet been implemented.
- Communication currently relies on user-provided email addresses rather than an integrated chat system.
- IPFS integration is planned but not fully implemented.
- MetaMask is required for blockchain interactions.
- Gas fees vary depending on Ethereum network congestion.
- No decentralised dispute resolution mechanism has been fully implemented yet.

---

## OpenZeppelin Contracts Used

- **ReentrancyGuard**

---

## Hardhat Version

**Hardhat v2**

All commands in this README are compatible with Hardhat version 2.

---

## License

This project was developed for academic purposes under:

**CS 218 — Programmable & Interoperable Blockchain**
