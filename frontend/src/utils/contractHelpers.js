import { ethers } from "ethers";
import ABI from "../constants/abi";
import { CONTRACT_ADDRESS, MIN_STAKE } from "../constants/config";

/**
 * Helper to get contract instance
 */
export const getContract = (signer) => {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
};

/**
 * Check if user has sufficient stake to submit feedback
 */
export const hasMinimumStake = async (account, provider) => {
  if (!provider) return false;
  const contract = getContract(provider);
  const stake = await contract.stakes(account);
  return stake >= BigInt(MIN_STAKE);
};

/**
 * Get feedback tokens for a job
 * Returns: { clientToken, freelancerToken }
 */
export const getJobFeedbackTokens = async (jobId, provider) => {
  const contract = getContract(provider);
  const [clientToken, freelancerToken] = await contract.getJobTokens(jobId);
  return { clientToken: Number(clientToken), freelancerToken: Number(freelancerToken) };
};

/**
 * Get feedback token details
 */
export const getFeedbackToken = async (tokenId, provider) => {
  const contract = getContract(provider);
  const [jobId, reviewer, reviewee, used, applied, reviewedAt, score, expiry] = await contract.tokens(tokenId);
  
  return {
    tokenId,
    jobId: Number(jobId),
    reviewer,
    reviewee,
    used,
    applied,
    reviewedAt: Number(reviewedAt),
    score: Number(score),
    expiry: Number(expiry),
    isExpired: Date.now() / 1000 > Number(expiry)
  };
};

/**
 * Check if feedback review window is closed (7 days after token creation)
 */
export const isReviewWindowClosed = (token) => {
  return Date.now() / 1000 > token.expiry;
};

/**
 * Get all jobs where account needs to submit feedback
 */
export const getPendingFeedbackJobs = async (account, role, provider) => {
  const contract = getContract(provider);
  const jobCnt = Number(await contract.jobCount());
  const pendingJobs = [];

  for (let i = 1; i <= jobCnt; i++) {
    const job = await contract.getJob(i);
    
    // Job must be in Done status
    if (Number(job.status) !== 2) continue; // 2 = Done

    // Check if current account is client or freelancer
    const isClient = job.client.toLowerCase() === account.toLowerCase();
    const isFreelancer = false; // We need to get service to check freelancer
    
    if (!isClient && !isFreelancer) continue;

    // Get tokens for this job
    const [clientToken, freelancerToken] = await contract.getJobTokens(i);
    
    // Determine which token is for this account
    let tokenId;
    if (role === 'client') {
      tokenId = Number(clientToken); // Client rates freelancer
    } else {
      tokenId = Number(freelancerToken); // Freelancer rates client
    }

    if (tokenId === 0) continue; // No token issued

    const token = await contract.tokens(tokenId);
    
    // Only show if token not yet used
    if (token.used) continue;

    pendingJobs.push({
      jobId: i,
      tokenId,
      job
    });
  }

  return pendingJobs;
};

/**
 * Submit feedback for a job
 * @param {number} tokenId - Feedback token ID
 * @param {number} score - Rating 1-5
 * @param {Signer} signer - Ethers signer
 */
export const submitFeedback = async (tokenId, score, signer) => {
  if (score < 1 || score > 5) throw new Error("Score must be 1-5");
  
  const contract = getContract(signer);
  const tx = await contract.submitFeedback(tokenId, score);
  return tx;
};

/**
 * Finalize review after 7-day window closes
 * @param {number} jobId - Job ID to finalize
 * @param {Signer} signer - Ethers signer
 */
export const finalizeReview = async (jobId, signer) => {
  const contract = getContract(signer);
  const tx = await contract.finalizeReview(jobId);
  return tx;
};

/**
 * Deposit stake for reputation participation
 * @param {BigInt} amount - Amount in wei
 * @param {Signer} signer - Ethers signer
 */
export const depositStake = async (amount, signer) => {
  const contract = getContract(signer);
  const tx = await contract.depositStake({ value: amount });
  return tx;
};

/**
 * Get user reputation
 */
export const getUserReputation = async (account, role, provider) => {
  const contract = getContract(provider);
  
  let result;
  if (role === 'freelancer') {
    result = await contract.getFreelancerReputation(account);
  } else {
    result = await contract.getClientReputation(account);
  }

  const [avgScoreScaled, totalWeight, totalJobs] = result;
  
  return {
    avgScore: Number(avgScoreScaled) / 100, // scaled by 100 in contract
    totalWeight: Number(totalWeight),
    totalJobs: Number(totalJobs),
    avgScoreRaw: Number(avgScoreScaled) // raw value (e.g. 425 = 4.25)
  };
};
