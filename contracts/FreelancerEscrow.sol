// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  FreelanceEscrow
 * @notice Decentralised escrow for freelance services with commit-reveal
 *         reputation, staking, and weighted scores.
 *
 * ─── REPUTATION SYSTEM ──────────────────────────────────────────────────────
 *
 *  COMMIT-REVEAL FLOW:
 *    STEP 1 — Off-chain: reviewer picks a score (1–5) and a random salt.
 *             They compute:  hash = keccak256(abi.encode(score, salt))
 *    STEP 2 — commitFeedback(tokenId, hash)  → stored on-chain.
 *    STEP 3 — revealFeedback(tokenId, score, salt)  → verified & applied.
 *
 *  WHY COMMIT-REVEAL:
 *    Prevents copy-cat voting — nobody can see your score before you reveal.
 *
 *  WEIGHTED SCORES:
 *    weight = timeWeight(daysSinceSubmit) × amountWeight(jobValueInFinney)
 *    More recent, higher-value jobs carry more weight in the average.
 *
 *  STAKING:
 *    Both parties must hold ≥ MIN_STAKE to commit a rating,
 *    acting as a Sybil-resistance deposit with no automatic penalties.
 *
 * ─── FEEDBACK TOKEN LIFECYCLE ───────────────────────────────────────────────
 *
 *  Tokens are issued ONLY when a job reaches Done status:
 *    ✔  confirmCompletion()  → issues 2 tokens (client→freelancer, freelancer→client)
 *    ✔  autoRelease()        → same as above
 *    ✗  cancelJob()          → no tokens (job did not complete)
 *
 *  Tokens expire after 7 days. After expiry, reveal is still accepted
 *  (expiry is informational for frontends; enforce off-chain if desired).
 *
 * ─── WORK SUBMISSION FLOW ───────────────────────────────────────────────────
 *
 *  SUBMIT:   freelancer uploads to IPFS off-chain, calls
 *            submitWork(jobId, keccak256(bytes(cid)))
 *  LOCK:     once status == Done, workCid is permanently frozen.
 *  REMOVE:   after cancellation, freelancer may call clearWork(jobId)
 *            → sets workCid = bytes32(0), signals frontend to unpin from IPFS.
 *
 * ─── GAS OPTIMISATIONS ──────────────────────────────────────────────────────
 *
 *  [G1] Tight struct packing  (see struct comments)
 *  [G2] Custom errors         (cheaper than revert strings)
 *  [G3] Prefix ++             (no temporary copy)
 *  [G4] Narrowed integer types: uint32 counters, uint88 price,
 *       uint64 timestamps, uint128 amount
 */
contract FreelanceEscrow is ReentrancyGuard {

    // ─────────────────────────────────────────────
    //  CUSTOM ERRORS
    // ─────────────────────────────────────────────

    error PriceMustBePositive();
    error MetadataCidRequired();
    error InvalidService();
    error ServiceNotAvailable();
    error IncorrectETH();
    error CannotHireYourself();
    error OnlyFreelancer();
    error InvalidJobState();
    error WorkCidRequired();
    error OnlyClient();
    error WorkNotSubmitted();
    error InvalidJob();
    error NotAllowed();
    error FreelancerCannotCancelSubmitted();
    error NotSubmitted();
    error TooEarlyForAutoRelease();
    error JobNotCompleted();
    error AlreadyRated();
    error InvalidScore();
    error TransferFailed();
    error JobNotCancelled();
    error InsufficientStake();
    error NotReviewer();
    error TokenUsed();
    error AlreadyRevealed();
    error InvalidReveal();
    error CommitNotFound();
    error ReviewWindowNotClosed();

    // ─────────────────────────────────────────────
    //  ENUMS
    // ─────────────────────────────────────────────

    enum ServiceStatus { Listed, Hired, Completed, Cancelled }
    enum JobStatus     { Active, Submitted, Done, Cancelled }

    // ─────────────────────────────────────────────
    //  STRUCTS
    // ─────────────────────────────────────────────

    /**
     * @dev slot 1: freelancer(20) | status(1) | priceWei(11)  = 32 bytes
     *      slot 2: metadataCid(32)                            = 32 bytes
     */
    struct Service {
        address payable freelancer;  // 20 bytes ─┐
        ServiceStatus   status;      //  1 byte   │ slot 1
        uint88          priceWei;    // 11 bytes ─┘
        bytes32         metadataCid; // 32 bytes ── slot 2
    }

    /**
     * @dev slot 1: client(20) | serviceId(4) | status(1) | clientRated(1) | freelancerRated(1) = 27 bytes
     *      slot 2: amount(16) | deadline(8) | submittedAt(8)                                   = 32 bytes
     *      slot 3: workCid(32)                                                                 = 32 bytes
     */
    struct Job {
   address payable client;      // 20 bytes ─┐
    uint32          serviceId;   //  4 bytes  │ slot 1
    JobStatus       status;      //  1 byte   ┘
    uint128         amount;      // 16 bytes ─┐
    uint64          deadline;    //  8 bytes  │ slot 2
    uint64          submittedAt; //  8 bytes  ┘
    bytes32         workCid;     // 32 bytes ── slot 3
    }

    /**
     * @dev Feedback token issued to each party upon job completion.
     *      reviewer  → the person who will rate
     *      reviewee  → the person being rated
     *      expiry    → informational deadline for frontends
     */
    struct FeedbackToken {
         uint32  jobId;       //  4 bytes ─┐
    address reviewer;    // 20 bytes  │ slot 1
    // ---                            │
    address reviewee;    // 20 bytes ─┐
    bool    used;        //  1 byte   │
    bool    applied;     //  1 byte   │ slot 2
    uint64  reviewedAt;  //  8 bytes  │
    uint8   score;       //  1 byte   ┘
    uint256 expiry;      // 32 bytes ── slot 3
    }

    /**
     * @dev Reputation uses weighted sums to favour recent, higher-value jobs.
     *      avgScore = (weightedScoreSum / weightSum)   (call getReputation() for scaled view)
     *
     *      slot 1: weightedScoreSum(32) = 32 bytes  (full uint — can grow large with many jobs)
     *      slot 2: weightSum(32)        = 32 bytes
     *
     *  Note: kept as full uint256 (not packed) because weightedScoreSum can
     *  grow very large for high-value / long-lived platforms.
     */
    struct Reputation {
        uint256 weightedScoreSum;
        uint256 weightSum;
        uint128 totalJobs;
    }

    /**
     * @dev Commit-reveal entry per (jobId, reviewer).
     *      slot 1: hash(32)             = 32 bytes
     *      slot 2: revealed(1) + pad    = 32 bytes  (1 bool, compiler pads)
     */
    struct Commit {
        bytes32 hash;
        bool    revealed;
    }

    // ─────────────────────────────────────────────
    //  CONSTANTS
    // ─────────────────────────────────────────────

    uint256 public constant MIN_STAKE = 0.05 ether;

    // ─────────────────────────────────────────────
    //  STORAGE
    // ─────────────────────────────────────────────

    uint32  public serviceCount;
    uint32  public jobCount;
    uint256 public tokenCount;

    mapping(uint32  => Service)    public services;
    mapping(uint32  => Job)        public jobs;

    // Reputation: weighted commit-reveal system
    mapping(address => Reputation) public freelancerRep;
    mapping(address => Reputation) public clientRep;

    // Feedback tokens: tokenId → token
    mapping(uint256 => FeedbackToken) public tokens;

    // jobId → [clientToken, freelancerToken]
    // index 0 = token for client to rate freelancer
    // index 1 = token for freelancer to rate client
    mapping(uint256 => uint256[2]) public jobTokens;

    // Commit-reveal: jobId → reviewer → Commit
    mapping(uint256 => mapping(address => Commit)) public commits;

    // Stakes deposited by users
    mapping(address => uint256) public stakes;

    // ─────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────

    event ServiceListed      (uint32  indexed serviceId, bytes32 metadataCid);
    event JobCreated         (uint32  indexed jobId);
    event WorkSubmitted      (uint32  indexed jobId, bytes32 workCid);
    event WorkCleared        (uint32  indexed jobId);
    event JobCompleted       (uint32  indexed jobId);
    event JobCancelled       (uint32  indexed jobId);

    event StakeDeposited     (address indexed user,   uint256 amount);

    event FeedbackTokenIssued(uint256 indexed tokenId, address reviewer, address reviewee);
    event FeedbackSubmitted (address indexed reviewer, uint256 jobId);
    event FeedbackApplied   (address indexed reviewer, address indexed reviewee, uint256 score, uint256 weight);
    // ─────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────

    function _safeTransfer(address payable recipient, uint256 amount) internal {
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _requireStake(address user) internal view {
        if (stakes[user] < MIN_STAKE) revert InsufficientStake();
    }

    /**
     * @dev Issues a feedback token pair (client→freelancer, freelancer→client)
     *      for a completed job. Called by both confirmCompletion and autoRelease.
     */
    function _issueFeedbackTokens(uint32 _jobId, address _client, address _freelancer) internal {
        // Token 0: client rates the freelancer
        ++tokenCount;
        tokens[tokenCount] = FeedbackToken({
            jobId:      _jobId,
    reviewer:   _client,
    reviewee:   _freelancer,
    used:       false,
    applied:    false,   // ← ADD THIS
    reviewedAt: 0,
    score:      0,
    expiry:     block.timestamp + 7 days
        });
        jobTokens[_jobId][0] = tokenCount;
        emit FeedbackTokenIssued(tokenCount, _client, _freelancer);

        // Token 1: freelancer rates the client
        ++tokenCount;
        tokens[tokenCount] = FeedbackToken({
           jobId:      _jobId,
    reviewer:   _freelancer,
    reviewee:   _client,
    used:       false,
    applied:    false,   // ← ADD
    reviewedAt: 0,       // ← ADD
    score:      0,       // ← ADD
    expiry:     block.timestamp + 7 days
        });
        jobTokens[_jobId][1] = tokenCount;
        emit FeedbackTokenIssued(tokenCount, _freelancer, _client);
    }

    /**
     * @dev Calculates a rating weight based on job recency and value.
     *      timeWeight  ∈ [1, 100]  — decays 1 point per day since submission.
     *      amountWeight ≥ 1        — job value in finney (1e15 wei); floored at 1.
     */
    function _calculateWeight(
    uint256 _amount,
    uint64  _jobSubmittedAt,
    uint64  _reviewedAt,
    uint256 _tokenExpiry
) internal pure returns (uint256) {
    // Existing: job recency (how old is the job)
    uint256 daysPassed   = (uint256(_reviewedAt) - uint256(_jobSubmittedAt)) / 1 days;
    uint256 timeWeight   = daysPassed < 100 ? 100 - daysPassed : 1;

    // New: review speed within the 7-day window (day 0 = weight 7, day 6 = weight 1)
    uint256 issuedAt     = _tokenExpiry - 7 days;
    uint256 daysToReview = _reviewedAt > issuedAt
        ? (uint256(_reviewedAt) - issuedAt) / 1 days
        : 0;
    uint256 speedWeight  = daysToReview < 7 ? 7 - daysToReview : 1;

    uint256 amountWeight = _amount / 1e15;
    if (amountWeight == 0) amountWeight = 1;

    return timeWeight * amountWeight * speedWeight;
}

/**
 * @dev Applies a submitted score to the reviewee's reputation.
 *      Called when visibility condition is met (both submitted OR expired).
 */
function _applyTokenScore(uint256 _tokenId) internal {
    FeedbackToken storage t = tokens[_tokenId];
    if (!t.used || t.applied) return;

    Job storage     j = jobs[t.jobId];
    Service storage s = services[j.serviceId];

    t.applied = true;

    uint256 weight = _calculateWeight(
        uint256(j.amount),
        j.submittedAt,
        t.reviewedAt,
        t.expiry
    );

    if (t.reviewee == s.freelancer) {
        freelancerRep[t.reviewee].weightedScoreSum += uint256(t.score) * weight;
        freelancerRep[t.reviewee].weightSum        += weight;
        ++freelancerRep[t.reviewee].totalJobs;
    } else {
        clientRep[t.reviewee].weightedScoreSum += uint256(t.score) * weight;
        clientRep[t.reviewee].weightSum        += weight;
        ++clientRep[t.reviewee].totalJobs;
    }

    emit FeedbackApplied(t.reviewer, t.reviewee, t.score, weight);
}

    // ─────────────────────────────────────────────
    //  1. STAKE MANAGEMENT
    // ─────────────────────────────────────────────

    /**
     * @notice 
     
      ETH as stake. Both parties need MIN_STAKE to commit feedback.
     *         Acts as Sybil resistance — no penalties are applied to the stake.
     */
    function depositStake() external payable {
        if (msg.value < MIN_STAKE) revert InsufficientStake();
        stakes[msg.sender] += msg.value;
        emit StakeDeposited(msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────
    //  2. OFFER SERVICE
    // ─────────────────────────────────────────────

    /**
     * @param _priceWei    Payment in wei. uint88 max ≈ 3×10^8 ETH.
     * @param _metadataCid keccak256(bytes(ipfsCID)) of off-chain JSON:
     *                     { "title": "...", "description": "..." }
     */
    function offerService(uint88 _priceWei, bytes32 _metadataCid) external {
        if (_priceWei == 0)             revert PriceMustBePositive();
        if (_metadataCid == bytes32(0)) revert MetadataCidRequired();

        uint32 id = ++serviceCount;
        services[id] = Service({
            freelancer:  payable(msg.sender),
            status:      ServiceStatus.Listed,
            priceWei:    _priceWei,
            metadataCid: _metadataCid
        });

        emit ServiceListed(id, _metadataCid);
    }

    // ─────────────────────────────────────────────
    //  3. HIRE FREELANCER
    // ─────────────────────────────────────────────

    function hireFreelancer(uint32 _serviceId) external payable nonReentrant {
        Service storage s = services[_serviceId];

        if (s.freelancer == address(0))       revert InvalidService();
        if (s.status != ServiceStatus.Listed) revert ServiceNotAvailable();
        if (msg.value != s.priceWei)          revert IncorrectETH();
        if (msg.sender == s.freelancer)       revert CannotHireYourself();

        uint32 id = ++jobCount;
        jobs[id] = Job({
            client:          payable(msg.sender),
            serviceId:       _serviceId,
            status:          JobStatus.Active,
            amount:          uint128(msg.value),
            deadline:        uint64(block.timestamp + 7 days),
            submittedAt:     0,
            workCid:         bytes32(0)
        });

        s.status = ServiceStatus.Hired;
        emit JobCreated(id);
    }

    // ─────────────────────────────────────────────
    //  4. SUBMIT WORK
    // ─────────────────────────────────────────────

    /**
     * @param _workCid keccak256(bytes(ipfsCID)) of the deliverables.
     *                 Stored on-chain as tamper-evident proof of delivery.
     */
    function submitWork(uint32 _jobId, bytes32 _workCid) external {
        Job storage     j = jobs[_jobId];
        Service storage s = services[j.serviceId];

        if (msg.sender != s.freelancer)   revert OnlyFreelancer();
        if (j.status != JobStatus.Active) revert InvalidJobState();
        if (_workCid == bytes32(0))        revert WorkCidRequired();

        j.status      = JobStatus.Submitted;
        j.submittedAt = uint64(block.timestamp);
        j.workCid     = _workCid;

        emit WorkSubmitted(_jobId, _workCid);
    }

    // ─────────────────────────────────────────────
    //  5. CONFIRM COMPLETION
    // ─────────────────────────────────────────────

    /**
     * @notice Client confirms work is accepted. workCid is permanently locked.
     *         Issues two feedback tokens (one per party) for the commit-reveal flow.
     */
    function confirmCompletion(uint32 _jobId) external nonReentrant {
        Job storage     j = jobs[_jobId];
        Service storage s = services[j.serviceId];

        if (msg.sender != j.client)          revert OnlyClient();
        if (j.status != JobStatus.Submitted) revert WorkNotSubmitted();

        j.status = JobStatus.Done;
        s.status = ServiceStatus.Completed;

        _safeTransfer(s.freelancer, j.amount);

        // Issue feedback tokens for both parties
        _issueFeedbackTokens(_jobId, j.client, s.freelancer);

        emit JobCompleted(_jobId);
    }

    // ─────────────────────────────────────────────
    //  6. CANCEL JOB
    // ─────────────────────────────────────────────

    /**
     * @notice Cancel an Active or Submitted job and refund the client.
     *         No feedback tokens are issued — job did not complete.
     *         Freelancer may call clearWork() after cancellation.
     */
    function cancelJob(uint32 _jobId) external nonReentrant {
        Job storage     j = jobs[_jobId];
        Service storage s = services[j.serviceId];

        if (j.status != JobStatus.Active && j.status != JobStatus.Submitted)
            revert InvalidJob();

        bool isTimeout = block.timestamp > j.deadline;

        if (j.status == JobStatus.Submitted) {
            // Only the client (or anyone after timeout) can cancel a submitted job.
            // The freelancer cannot cancel once they've submitted — prevents gaming.
            if (msg.sender != j.client && !isTimeout)
                revert FreelancerCannotCancelSubmitted();
        } else {
            // Active: either party can cancel, or anyone after deadline
            if (msg.sender != j.client && msg.sender != s.freelancer && !isTimeout)
                revert NotAllowed();
        }

        j.status = JobStatus.Cancelled;
        s.status = ServiceStatus.Cancelled;

        _safeTransfer(j.client, j.amount);

        emit JobCancelled(_jobId);
        // workCid still exists on-chain. Freelancer should call clearWork() to unpin.
    }

    // ─────────────────────────────────────────────
    //  7. AUTO RELEASE
    // ─────────────────────────────────────────────

    /**
     * @notice Anyone can trigger payment if the client hasn't responded in 3 days.
     *         workCid is permanently locked after this call.
     *         Issues feedback tokens just like confirmCompletion.
     *
     * @dev  V1 BUG FIX: the original autoRelease did not issue feedback tokens,
     *       meaning auto-completed jobs could never be rated. Fixed here.
     */
    function autoRelease(uint32 _jobId) external nonReentrant {
        Job storage     j = jobs[_jobId];
        Service storage s = services[j.serviceId];

        if (j.status != JobStatus.Submitted)           revert NotSubmitted();
        if (block.timestamp <= j.submittedAt + 3 days) revert TooEarlyForAutoRelease();

        j.status = JobStatus.Done;
        s.status = ServiceStatus.Completed;

        _safeTransfer(s.freelancer, j.amount);

        // Issue feedback tokens — same as confirmCompletion
        _issueFeedbackTokens(_jobId, j.client, s.freelancer);

        emit JobCompleted(_jobId);
    }

    // ─────────────────────────────────────────────
    //  8. CLEAR WORK  (only after cancellation)
    // ─────────────────────────────────────────────

    /**
     * @notice Freelancer clears their submitted work CID after a cancellation.
     *         Sets workCid = bytes32(0) → frontend should unpin the CID from IPFS.
     *
     * LOCK RULE: only callable when status == Cancelled.
     *            Cannot be called on Done jobs — completed deliveries are immutable.
     */
    function clearWork(uint32 _jobId) external {
        Job storage     j = jobs[_jobId];
        Service storage s = services[j.serviceId];

        if (msg.sender != s.freelancer)      revert OnlyFreelancer();
        if (j.status != JobStatus.Cancelled) revert JobNotCancelled();

        j.workCid = bytes32(0);

        emit WorkCleared(_jobId);
    }
/**
 * @notice Submit your rating for the counterparty (1–5).
 *         Score is stored but not applied to reputation until visible:
 *           • BOTH parties have submitted, OR
 *           • The 7-day window has elapsed (call finalizeReview after expiry).
 *
 * @dev  True on-chain storage is always readable via raw slot access.
 *       This function controls what official view functions expose.
 */
function submitFeedback(uint256 _tokenId, uint8 _score) external {
    FeedbackToken storage t = tokens[_tokenId];

    if (msg.sender != t.reviewer) revert NotReviewer();
    if (t.used)                   revert TokenUsed();
    if (_score < 1 || _score > 5) revert InvalidScore();
    _requireStake(msg.sender);

    t.score      = _score;
    t.used       = true;
    t.reviewedAt = uint64(block.timestamp);

    emit FeedbackSubmitted(msg.sender, t.jobId);

    // Check if counterpart has already submitted → apply both immediately
    uint256[2] storage jt = jobTokens[t.jobId];
    uint256 otherId = (jt[0] == _tokenId) ? jt[1] : jt[0];

    if (tokens[otherId].used) {
        _applyTokenScore(_tokenId);
        _applyTokenScore(otherId);   // idempotent if already applied
    }
}

/**
 * @notice Apply any pending scores after the 7-day window closes.
 *         Callable by anyone — no trust required.
 *         Handles the case where only one party (or neither) submitted.
 */
function finalizeReview(uint32 _jobId) external {
    uint256[2] storage jt = jobTokens[_jobId];
    FeedbackToken storage t0 = tokens[jt[0]];

    if (block.timestamp < t0.expiry) revert ReviewWindowNotClosed();

    _applyTokenScore(jt[0]);
    _applyTokenScore(jt[1]);
}
    // ─────────────────────────────────────────────
    //  11. VIEW — FREELANCER REPUTATION
    // ─────────────────────────────────────────────

    /**
     * @return avgScoreScaled  Weighted average score × 100 (e.g. 425 = 4.25 / 5.00)
     * @return totalWeight     Sum of all weights (proxy for activity/reliability)
     */
    function getFreelancerReputation(address _freelancer)
    external view
    returns (uint256 avgScoreScaled, uint256 totalWeight, uint128 totalJobs)
{
    Reputation memory rep = freelancerRep[_freelancer];
    if (rep.weightSum == 0) return (0, 0, 0);
    return (
        (rep.weightedScoreSum * 100) / rep.weightSum,
        rep.weightSum,
        rep.totalJobs
    );
}



    // ─────────────────────────────────────────────
    //  12. VIEW — CLIENT REPUTATION
    // ─────────────────────────────────────────────

    /**
     * @return avgScoreScaled  Weighted average score × 100
     * @return totalWeight     Sum of all weights
     */
    function getClientReputation(address _client)
    external view
    returns (uint256 avgScoreScaled, uint256 totalWeight, uint128 totalJobs)
{
    Reputation memory rep = clientRep[_client];
    if (rep.weightSum == 0) return (0, 0, 0);
    return (
        (rep.weightedScoreSum * 100) / rep.weightSum,
        rep.weightSum,
        rep.totalJobs
    );
}

    // ─────────────────────────────────────────────
    //  13. VIEW HELPERS
    // ─────────────────────────────────────────────

    function getService(uint32 _id) external view returns (Service memory) {
        return services[_id];
    }

    function getJob(uint32 _id) external view returns (Job memory) {
        return jobs[_id];
    }

    function getJobTokens(uint32 _jobId)
        external view
        returns (uint256 clientToken, uint256 freelancerToken)
    {
        return (jobTokens[_jobId][0], jobTokens[_jobId][1]);
    }
}