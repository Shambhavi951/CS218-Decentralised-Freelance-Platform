export const ABI = [
  {
    "inputs": [],
    "name": "AlreadyRated",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadyRevealed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CannotHireYourself",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "CommitNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FreelancerCannotCancelSubmitted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "IncorrectETH",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientStake",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidJob",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidJobState",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidReveal",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidScore",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidService",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "JobNotCancelled",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "JobNotCompleted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "MetadataCidRequired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAllowed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotReviewer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotSubmitted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyClient",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "OnlyFreelancer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PriceMustBePositive",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReviewWindowNotClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ServiceNotAvailable",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TokenUsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TooEarlyForAutoRelease",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WorkCidRequired",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "WorkNotSubmitted",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewee",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "score",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "weight",
        "type": "uint256"
      }
    ],
    "name": "FeedbackApplied",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "jobId",
        "type": "uint256"
      }
    ],
    "name": "FeedbackSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "reviewee",
        "type": "address"
      }
    ],
    "name": "FeedbackTokenIssued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      }
    ],
    "name": "JobCancelled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      }
    ],
    "name": "JobCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      }
    ],
    "name": "JobCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "serviceId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "metadataCid",
        "type": "bytes32"
      }
    ],
    "name": "ServiceListed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "StakeDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      }
    ],
    "name": "WorkCleared",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "workCid",
        "type": "bytes32"
      }
    ],
    "name": "WorkSubmitted",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MIN_STAKE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "autoRelease",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "cancelJob",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "clearWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "clientRep",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "weightedScoreSum",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "weightSum",
        "type": "uint256"
      },
      {
        "internalType": "uint128",
        "name": "totalJobs",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "commits",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "hash",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "revealed",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "confirmCompletion",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "depositStake",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "finalizeReview",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "freelancerRep",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "weightedScoreSum",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "weightSum",
        "type": "uint256"
      },
      {
        "internalType": "uint128",
        "name": "totalJobs",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_client",
        "type": "address"
      }
    ],
    "name": "getClientReputation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "avgScoreScaled",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalWeight",
        "type": "uint256"
      },
      {
        "internalType": "uint128",
        "name": "totalJobs",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_freelancer",
        "type": "address"
      }
    ],
    "name": "getFreelancerReputation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "avgScoreScaled",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalWeight",
        "type": "uint256"
      },
      {
        "internalType": "uint128",
        "name": "totalJobs",
        "type": "uint128"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_id",
        "type": "uint32"
      }
    ],
    "name": "getJob",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address payable",
            "name": "client",
            "type": "address"
          },
          {
            "internalType": "uint32",
            "name": "serviceId",
            "type": "uint32"
          },
          {
            "internalType": "enum FreelanceEscrow.JobStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint128",
            "name": "amount",
            "type": "uint128"
          },
          {
            "internalType": "uint64",
            "name": "deadline",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "submittedAt",
            "type": "uint64"
          },
          {
            "internalType": "bytes32",
            "name": "workCid",
            "type": "bytes32"
          }
        ],
        "internalType": "struct FreelanceEscrow.Job",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      }
    ],
    "name": "getJobTokens",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "clientToken",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "freelancerToken",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_id",
        "type": "uint32"
      }
    ],
    "name": "getService",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address payable",
            "name": "freelancer",
            "type": "address"
          },
          {
            "internalType": "enum FreelanceEscrow.ServiceStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint88",
            "name": "priceWei",
            "type": "uint88"
          },
          {
            "internalType": "bytes32",
            "name": "metadataCid",
            "type": "bytes32"
          }
        ],
        "internalType": "struct FreelanceEscrow.Service",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "serviceId",
        "type": "uint32"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "hireFreelancer",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "jobCount",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "jobTokens",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "name": "jobs",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "client",
        "type": "address"
      },
      {
        "internalType": "uint32",
        "name": "serviceId",
        "type": "uint32"
      },
      {
        "internalType": "enum FreelanceEscrow.JobStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "uint128",
        "name": "amount",
        "type": "uint128"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "submittedAt",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "workCid",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint88",
        "name": "_priceWei",
        "type": "uint88"
      },
      {
        "internalType": "bytes32",
        "name": "_metadataCid",
        "type": "bytes32"
      }
    ],
    "name": "offerService",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "serviceCount",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "name": "services",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "freelancer",
        "type": "address"
      },
      {
        "internalType": "enum FreelanceEscrow.ServiceStatus",
        "name": "status",
        "type": "uint8"
      },
      {
        "internalType": "uint88",
        "name": "priceWei",
        "type": "uint88"
      },
      {
        "internalType": "bytes32",
        "name": "metadataCid",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "stakes",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_tokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "_score",
        "type": "uint8"
      }
    ],
    "name": "submitFeedback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "_jobId",
        "type": "uint32"
      },
      {
        "internalType": "bytes32",
        "name": "_workCid",
        "type": "bytes32"
      }
    ],
    "name": "submitWork",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tokenCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "tokens",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "jobId",
        "type": "uint32"
      },
      {
        "internalType": "address",
        "name": "reviewer",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "reviewee",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "used",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "applied",
        "type": "bool"
      },
      {
        "internalType": "uint64",
        "name": "reviewedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint8",
        "name": "score",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "expiry",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];