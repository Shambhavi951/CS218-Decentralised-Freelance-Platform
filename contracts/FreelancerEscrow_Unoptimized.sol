// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  FreelanceEscrow  (un-optimized reference version)
 * @notice Same behavior as the gas-optimized contract, but written in the
 *         most readable / idiomatic style — no custom errors, no struct
 *         packing tricks, no narrowed integer types, no prefix-increment
 *         micro-optimizations.
 *
 *         Slither correctness fixes are retained:
 *           • Pragma pinned to 0.8.28
 *           • CEI ordering in confirmCompletion / autoRelease
 *           • Multiply-before-divide in _calculateWeight
 */
contract FreelanceEscrow is ReentrancyGuard {

    // ─────────────────────────────────────────────
    //  ENUMS
    // ─────────────────────────────────────────────

    enum ServiceStatus { Listed, Hired, Completed, Cancelled }
    enum JobStatus     { Active, Submitted, Done, Cancelled }

    // ─────────────────────────────────────────────
    //  STRUCTS  (natural types, no packing)
    // ─────────────────────────────────────────────

    struct Service {
        address payable freelancer;
        ServiceStatus   status;
        uint256         priceWei;
        bytes32         metadataCid;
    }

    struct Job {
        address payable client;
        uint256         serviceId;
        JobStatus       status;
        uint256         amount;
        uint256         deadline;
        uint256         submittedAt;
        bytes32         workCid;
    }

    struct FeedbackToken {
        uint256 jobId;
        address reviewer;
        address reviewee;
        bool    used;
        bool    applied;
        uint256 reviewedAt;
        uint256 score;
        uint256 expiry;
    }

    struct Reputation {
        uint256 weightedScoreSum;
        uint256 weightSum;
        uint256 totalJobs;
    }

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

    uint256 public serviceCount;
    uint256 public jobCount;
    uint256 public tokenCount;

    mapping(uint256 => Service)       public services;
    mapping(uint256 => Job)           public jobs;
    mapping(address => Reputation)    public freelancerRep;
    mapping(address => Reputation)    public clientRep;
    mapping(uint256 => FeedbackToken) public tokens;
    mapping(uint256 => uint256[2])    public jobTokens;
    mapping(uint256 => mapping(address => Commit)) public commits;
    mapping(address => uint256)       public stakes;

    // ─────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────

    event ServiceListed       (uint256 indexed serviceId, bytes32 metadataCid);
    event JobCreated          (uint256 indexed jobId);
    event WorkSubmitted       (uint256 indexed jobId, bytes32 workCid);
    event WorkCleared         (uint256 indexed jobId);
    event JobCompleted        (uint256 indexed jobId);
    event JobCancelled        (uint256 indexed jobId);
    event StakeDeposited      (address indexed user, uint256 amount);
    event FeedbackTokenIssued (uint256 indexed tokenId, address reviewer, address reviewee);
    event FeedbackSubmitted   (address indexed reviewer, uint256 jobId);
    event FeedbackApplied     (address indexed reviewer, address indexed reviewee, uint256 score, uint256 weight);

    // ─────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────

    function _safeTransfer(address payable recipient, uint256 amount) internal {
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function _requireStake(address user) internal view {
        require(stakes[user] >= MIN_STAKE, "Insufficient stake");
    }

    function _issueFeedbackTokens(
        uint256 jobId,
        address clientAddr,
        address freelancerAddr
    ) internal {
        // Token 0: client rates the freelancer
        tokenCount = tokenCount + 1;
        tokens[tokenCount] = FeedbackToken({
            jobId:      jobId,
            reviewer:   clientAddr,
            reviewee:   freelancerAddr,
            used:       false,
            applied:    false,
            reviewedAt: 0,
            score:      0,
            expiry:     block.timestamp + 7 days
        });
        jobTokens[jobId][0] = tokenCount;
        emit FeedbackTokenIssued(tokenCount, clientAddr, freelancerAddr);

        // Token 1: freelancer rates the client
        tokenCount = tokenCount + 1;
        tokens[tokenCount] = FeedbackToken({
            jobId:      jobId,
            reviewer:   freelancerAddr,
            reviewee:   clientAddr,
            used:       false,
            applied:    false,
            reviewedAt: 0,
            score:      0,
            expiry:     block.timestamp + 7 days
        });
        jobTokens[jobId][1] = tokenCount;
        emit FeedbackTokenIssued(tokenCount, freelancerAddr, clientAddr);
    }

    /**
     * @dev Calculates rating weight. Multiply-before-divide is preserved
     *      to avoid precision loss (Slither FIX-1).
     */
    function _calculateWeight(
        uint256 amount,
        uint256 jobSubmittedAt,
        uint256 reviewedAt,
        uint256 tokenExpiry
    ) internal pure returns (uint256) {
        uint256 daysPassed = (reviewedAt - jobSubmittedAt) / 1 days;
        uint256 timeWeight;
        if (daysPassed < 100) {
            timeWeight = 100 - daysPassed;
        } else {
            timeWeight = 1;
        }

        uint256 issuedAt = tokenExpiry - 7 days;
        uint256 daysToReview;
        if (reviewedAt > issuedAt) {
            daysToReview = (reviewedAt - issuedAt) / 1 days;
        } else {
            daysToReview = 0;
        }
        uint256 speedWeight;
        if (daysToReview < 7) {
            speedWeight = 7 - daysToReview;
        } else {
            speedWeight = 1;
        }

        uint256 scaledAmount;
        if (amount >= 1e15) {
            scaledAmount = amount;
        } else {
            scaledAmount = 1e15;
        }

        return timeWeight * speedWeight * scaledAmount / 1e15;
    }

    function _applyTokenScore(uint256 tokenId) internal {
        FeedbackToken storage t = tokens[tokenId];
        if (!t.used || t.applied) {
            return;
        }

        Job storage     j = jobs[t.jobId];
        Service storage s = services[j.serviceId];

        t.applied = true;

        uint256 weight = _calculateWeight(
            j.amount,
            j.submittedAt,
            t.reviewedAt,
            t.expiry
        );

        if (t.reviewee == s.freelancer) {
            freelancerRep[t.reviewee].weightedScoreSum = freelancerRep[t.reviewee].weightedScoreSum + (t.score * weight);
            freelancerRep[t.reviewee].weightSum        = freelancerRep[t.reviewee].weightSum + weight;
            freelancerRep[t.reviewee].totalJobs        = freelancerRep[t.reviewee].totalJobs + 1;
        } else {
            clientRep[t.reviewee].weightedScoreSum = clientRep[t.reviewee].weightedScoreSum + (t.score * weight);
            clientRep[t.reviewee].weightSum        = clientRep[t.reviewee].weightSum + weight;
            clientRep[t.reviewee].totalJobs        = clientRep[t.reviewee].totalJobs + 1;
        }

        emit FeedbackApplied(t.reviewer, t.reviewee, t.score, weight);
    }

    // ─────────────────────────────────────────────
    //  1. STAKE MANAGEMENT
    // ─────────────────────────────────────────────

    function depositStake() external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        stakes[msg.sender] = stakes[msg.sender] + msg.value;
        emit StakeDeposited(msg.sender, msg.value);
    }

    // ─────────────────────────────────────────────
    //  2. OFFER SERVICE
    // ─────────────────────────────────────────────

    function offerService(uint256 priceWei, bytes32 metadataCid) external {
        require(priceWei > 0, "Price must be positive");
        require(metadataCid != bytes32(0), "Metadata CID required");

        serviceCount = serviceCount + 1;
        uint256 id = serviceCount;

        services[id] = Service({
            freelancer:  payable(msg.sender),
            status:      ServiceStatus.Listed,
            priceWei:    priceWei,
            metadataCid: metadataCid
        });

        emit ServiceListed(id, metadataCid);
    }

    // ─────────────────────────────────────────────
    //  3. HIRE FREELANCER
    // ─────────────────────────────────────────────

    function hireFreelancer(uint256 serviceId) external payable nonReentrant {
        Service storage s = services[serviceId];

        require(s.freelancer != address(0),          "Invalid service");
        require(s.status == ServiceStatus.Listed,    "Service not available");
        require(msg.value == s.priceWei,             "Incorrect ETH");
        require(msg.sender != s.freelancer,          "Cannot hire yourself");

        jobCount = jobCount + 1;
        uint256 id = jobCount;

        jobs[id] = Job({
            client:      payable(msg.sender),
            serviceId:   serviceId,
            status:      JobStatus.Active,
            amount:      msg.value,
            deadline:    block.timestamp + 7 days,
            submittedAt: 0,
            workCid:     bytes32(0)
        });

        s.status = ServiceStatus.Hired;
        emit JobCreated(id);
    }

    // ─────────────────────────────────────────────
    //  4. SUBMIT WORK
    // ─────────────────────────────────────────────

    function submitWork(uint256 jobId, bytes32 workCid) external {
        Job storage     j = jobs[jobId];
        Service storage s = services[j.serviceId];

        require(msg.sender == s.freelancer,    "Only freelancer");
        require(j.status == JobStatus.Active,  "Invalid job state");
        require(workCid != bytes32(0),         "Work CID required");

        j.status      = JobStatus.Submitted;
        j.submittedAt = block.timestamp;
        j.workCid     = workCid;

        emit WorkSubmitted(jobId, workCid);
    }

    // ─────────────────────────────────────────────
    //  5. CONFIRM COMPLETION
    // ─────────────────────────────────────────────

    function confirmCompletion(uint256 jobId) external nonReentrant {
        Job storage     j = jobs[jobId];
        Service storage s = services[j.serviceId];

        require(msg.sender == j.client,           "Only client");
        require(j.status == JobStatus.Submitted,  "Work not submitted");

        // Cache before state writes (CEI fix)
        address payable freelancerAddr = s.freelancer;
        address         clientAddr     = j.client;
        uint256         payAmount      = j.amount;

        // Effects
        j.status = JobStatus.Done;
        s.status = ServiceStatus.Completed;
        _issueFeedbackTokens(jobId, clientAddr, freelancerAddr);

        emit JobCompleted(jobId);

        // Interaction (last)
        _safeTransfer(freelancerAddr, payAmount);
    }

    // ─────────────────────────────────────────────
    //  6. CANCEL JOB
    // ─────────────────────────────────────────────

    function cancelJob(uint256 jobId) external nonReentrant {
        Job storage     j = jobs[jobId];
        Service storage s = services[j.serviceId];

        require(
            j.status == JobStatus.Active || j.status == JobStatus.Submitted,
            "Invalid job"
        );

        bool isTimeout = block.timestamp > j.deadline;

        if (j.status == JobStatus.Submitted) {
            require(
                msg.sender == j.client || isTimeout,
                "Freelancer cannot cancel submitted"
            );
        } else {
            require(
                msg.sender == j.client || msg.sender == s.freelancer || isTimeout,
                "Not allowed"
            );
        }

        // Cache
        address payable clientAddr = j.client;
        uint256         payAmount  = j.amount;

        // Effects
        j.status = JobStatus.Cancelled;
        s.status = ServiceStatus.Cancelled;

        emit JobCancelled(jobId);

        // Interaction
        _safeTransfer(clientAddr, payAmount);
    }

    // ─────────────────────────────────────────────
    //  7. AUTO RELEASE
    // ─────────────────────────────────────────────

    function autoRelease(uint256 jobId) external nonReentrant {
        Job storage     j = jobs[jobId];
        Service storage s = services[j.serviceId];

        require(j.status == JobStatus.Submitted,              "Not submitted");
        require(block.timestamp > j.submittedAt + 3 days,     "Too early for auto release");

        // Cache
        address payable freelancerAddr = s.freelancer;
        address         clientAddr     = j.client;
        uint256         payAmount      = j.amount;

        // Effects
        j.status = JobStatus.Done;
        s.status = ServiceStatus.Completed;
        _issueFeedbackTokens(jobId, clientAddr, freelancerAddr);

        emit JobCompleted(jobId);

        // Interaction
        _safeTransfer(freelancerAddr, payAmount);
    }

    // ─────────────────────────────────────────────
    //  8. CLEAR WORK
    // ─────────────────────────────────────────────

    function clearWork(uint256 jobId) external {
        Job storage     j = jobs[jobId];
        Service storage s = services[j.serviceId];

        require(msg.sender == s.freelancer,         "Only freelancer");
        require(j.status == JobStatus.Cancelled,    "Job not cancelled");

        j.workCid = bytes32(0);

        emit WorkCleared(jobId);
    }

    // ─────────────────────────────────────────────
    //  9. SUBMIT FEEDBACK
    // ─────────────────────────────────────────────

    function submitFeedback(uint256 tokenId, uint256 score) external {
        FeedbackToken storage t = tokens[tokenId];

        require(msg.sender == t.reviewer,  "Not reviewer");
        require(!t.used,                   "Token used");
        require(score >= 1 && score <= 5,  "Invalid score");
        _requireStake(msg.sender);

        t.score      = score;
        t.used       = true;
        t.reviewedAt = block.timestamp;

        emit FeedbackSubmitted(msg.sender, t.jobId);

        uint256[2] storage jt = jobTokens[t.jobId];
        uint256 otherId;
        if (jt[0] == tokenId) {
            otherId = jt[1];
        } else {
            otherId = jt[0];
        }

        if (tokens[otherId].used) {
            _applyTokenScore(tokenId);
            _applyTokenScore(otherId);
        }
    }

    // ─────────────────────────────────────────────
    //  10. FINALIZE REVIEW
    // ─────────────────────────────────────────────

    function finalizeReview(uint256 jobId) external {
        uint256[2] storage jt = jobTokens[jobId];
        FeedbackToken storage t0 = tokens[jt[0]];

        require(block.timestamp >= t0.expiry, "Review window not closed");

        _applyTokenScore(jt[0]);
        _applyTokenScore(jt[1]);
    }

    // ─────────────────────────────────────────────
    //  11. VIEW — FREELANCER REPUTATION
    // ─────────────────────────────────────────────

    function getFreelancerReputation(address freelancer)
        external view
        returns (uint256 avgScoreScaled, uint256 totalWeight, uint256 totalJobs)
    {
        Reputation memory rep = freelancerRep[freelancer];
        if (rep.weightSum == 0) {
            return (0, 0, 0);
        }
        return (
            (rep.weightedScoreSum * 100) / rep.weightSum,
            rep.weightSum,
            rep.totalJobs
        );
    }

    // ─────────────────────────────────────────────
    //  12. VIEW — CLIENT REPUTATION
    // ─────────────────────────────────────────────

    function getClientReputation(address client)
        external view
        returns (uint256 avgScoreScaled, uint256 totalWeight, uint256 totalJobs)
    {
        Reputation memory rep = clientRep[client];
        if (rep.weightSum == 0) {
            return (0, 0, 0);
        }
        return (
            (rep.weightedScoreSum * 100) / rep.weightSum,
            rep.weightSum,
            rep.totalJobs
        );
    }

    // ─────────────────────────────────────────────
    //  13. VIEW HELPERS
    // ─────────────────────────────────────────────

    function getService(uint256 id) external view returns (Service memory) {
        return services[id];
    }

    function getJob(uint256 id) external view returns (Job memory) {
        return jobs[id];
    }

    function getJobTokens(uint256 jobId)
        external view
        returns (uint256 clientToken, uint256 freelancerToken)
    {
        return (jobTokens[jobId][0], jobTokens[jobId][1]);
    }
}
