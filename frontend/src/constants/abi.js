export const ABI = [
  {
    "inputs": [],
    "name": "serviceCount",
    "outputs": [{ "type": "uint32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "jobCount",
    "outputs": [{ "type": "uint32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "type": "uint88", "name": "_priceWei" },
      { "type": "bytes32", "name": "_metadataCid" }
    ],
    "name": "offerService",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_serviceId" }],
    "name": "hireFreelancer",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "type": "uint32", "name": "_jobId" },
      { "type": "bytes32", "name": "_workCid" }
    ],
    "name": "submitWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "confirmCompletion",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "cancelJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "autoRelease",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "clearWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "address", "name": "_freelancer" }],
    "name": "getReputation",
    "outputs": [
      { "type": "uint256", "name": "avgScoreScaled" },
      { "type": "uint256", "name": "totalJobs" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "type": "address", "name": "_client" }],
    "name": "getClientReputation",
    "outputs": [
      { "type": "uint256", "name": "avgScoreScaled" },
      { "type": "uint256", "name": "totalJobs" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_id" }],
    "name": "getService",
    "outputs": [
      {
        "components": [
          { "type": "address", "name": "freelancer" },
          { "type": "uint8", "name": "status" },
          { "type": "uint88", "name": "priceWei" },
          { "type": "bytes32", "name": "metadataCid" }
        ],
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_id" }],
    "name": "getJob",
    "outputs": [
      {
        "components": [
          { "type": "address", "name": "client" },
          { "type": "uint32", "name": "serviceId" },
          { "type": "uint8", "name": "status" },
          { "type": "bool", "name": "clientRated" },
          { "type": "bool", "name": "freelancerRated" },
          { "type": "uint128", "name": "amount" },
          { "type": "uint64", "name": "deadline" },
          { "type": "uint64", "name": "submittedAt" },
          { "type": "bytes32", "name": "workCid" }
        ],
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];