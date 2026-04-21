export const ABI = [
  // ─── STAKE MANAGEMENT ───
  {
    "inputs": [],
    "name": "depositStake",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "address", "name": "_user" }],
    "name": "stakes",
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // ─── SERVICE MANAGEMENT ───
  {
    "inputs": [],
    "name": "serviceCount",
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
    "inputs": [{ "type": "uint32", "name": "_id" }],
    "name": "getService",
    "outputs": [
      {
        "components": [
          { "type": "address payable", "name": "freelancer" },
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
  // ─── JOB MANAGEMENT ───
  {
    "inputs": [],
    "name": "jobCount",
    "outputs": [{ "type": "uint32" }],
    "stateMutability": "view",
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
    "inputs": [{ "type": "uint32", "name": "_id" }],
    "name": "getJob",
    "outputs": [
      {
        "components": [
          { "type": "address payable", "name": "client" },
          { "type": "uint32", "name": "serviceId" },
          { "type": "uint8", "name": "status" },
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
  },
  // ─── FEEDBACK & REPUTATION ───
  {
    "inputs": [{ "type": "uint256", "name": "_tokenId" }],
    "name": "tokens",
    "outputs": [
      { "type": "uint32", "name": "jobId" },
      { "type": "address", "name": "reviewer" },
      { "type": "address", "name": "reviewee" },
      { "type": "bool", "name": "used" },
      { "type": "bool", "name": "applied" },
      { "type": "uint64", "name": "reviewedAt" },
      { "type": "uint8", "name": "score" },
      { "type": "uint256", "name": "expiry" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "type": "uint256", "name": "_tokenId" },
      { "type": "uint8", "name": "_score" }
    ],
    "name": "submitFeedback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "finalizeReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "type": "uint32", "name": "_jobId" }],
    "name": "getJobTokens",
    "outputs": [
      { "type": "uint256", "name": "clientToken" },
      { "type": "uint256", "name": "freelancerToken" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "type": "address", "name": "_freelancer" }],
    "name": "getFreelancerReputation",
    "outputs": [
      { "type": "uint256", "name": "avgScoreScaled" },
      { "type": "uint256", "name": "totalWeight" },
      { "type": "uint128", "name": "totalJobs" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "type": "address", "name": "_client" }],
    "name": "getClientReputation",
    "outputs": [
      { "type": "uint256", "name": "avgScoreScaled" },
      { "type": "uint256", "name": "totalWeight" },
      { "type": "uint128", "name": "totalJobs" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // ─── EVENTS ───
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "user", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "name": "StakeDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "serviceId", "type": "uint32" },
      { "indexed": false, "name": "metadataCid", "type": "bytes32" }
    ],
    "name": "ServiceListed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint32" }
    ],
    "name": "JobCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint32" },
      { "indexed": false, "name": "workCid", "type": "bytes32" }
    ],
    "name": "WorkSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint32" }
    ],
    "name": "JobCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint32" }
    ],
    "name": "JobCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "tokenId", "type": "uint256" },
      { "indexed": false, "name": "reviewer", "type": "address" },
      { "indexed": false, "name": "reviewee", "type": "address" }
    ],
    "name": "FeedbackTokenIssued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "reviewer", "type": "address" },
      { "indexed": false, "name": "jobId", "type": "uint256" }
    ],
    "name": "FeedbackSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "reviewer", "type": "address" },
      { "indexed": true, "name": "reviewee", "type": "address" },
      { "indexed": false, "name": "score", "type": "uint256" },
      { "indexed": false, "name": "weight", "type": "uint256" }
    ],
    "name": "FeedbackApplied",
    "type": "event"
  }
];