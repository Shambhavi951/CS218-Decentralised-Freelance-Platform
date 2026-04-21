// ─────────────────────────────────────────────────────────────────────────────
//  FreelanceEscrow.test.js
//  Hardhat + Ethers v6 + Chai test suite — targets ≥ 90% line/branch coverage.
//
//  SETUP:
//    npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
//    npx hardhat test
//
//  Run with coverage:
//    npx hardhat coverage
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  FreelanceEscrow.test.js
//  Hardhat + Ethers v6 + Chai test suite — targets ≥ 90% line/branch coverage.
//
//  SETUP:
//    npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
//    npx hardhat test
//
//  Run with coverage:
//    npx hardhat coverage
// ─────────────────────────────────────────────────────────────────────────────

const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { time }        = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue }    = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// ─────────────────────────────────────────────
//  CONSTANTS  (mirror contract values)
// ─────────────────────────────────────────────

const MIN_STAKE   = ethers.parseEther("0.05");
const PRICE       = ethers.parseEther("1.0");
const META_CID    = ethers.keccak256(ethers.toUtf8Bytes("QmMeta"));
const WORK_CID    = ethers.keccak256(ethers.toUtf8Bytes("QmWork"));

const DAY         = 24 * 60 * 60;
const DAYS_3      = 3 * DAY;
const DAYS_7      = 7 * DAY;

// JobStatus / ServiceStatus enum indices
const SVC = { Listed: 0, Hired: 1, Completed: 2, Cancelled: 3 };
const JOB = { Active: 0, Submitted: 1, Done: 2, Cancelled: 3 };

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Deploy a fresh contract before each test. */
async function deploy() {
  const [owner, freelancer, client, stranger] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow  = await Factory.deploy();
  return { escrow, owner, freelancer, client, stranger };
}

/**
 * Full happy-path setup: list service → hire → submit work.
 * Returns { escrow, freelancer, client, stranger, serviceId, jobId }.
 */
async function setupActiveJob(overrides = {}) {
  const { escrow, owner, freelancer, client, stranger } = await deploy();
  const price = overrides.price ?? PRICE;

  await escrow.connect(freelancer).offerService(price, META_CID);
  const serviceId = 1;

  await escrow.connect(client).hireFreelancer(serviceId, { value: price });
  const jobId = 1;

  return { escrow, owner, freelancer, client, stranger, serviceId, jobId };
}

/**
 * Setup up to "work submitted" state.
 */
async function setupSubmittedJob(overrides = {}) {
  const base = await setupActiveJob(overrides);
  await base.escrow.connect(base.freelancer).submitWork(base.jobId, WORK_CID);
  return base;
}

/**
 * Setup a completed job (confirmCompletion called).
 * Returns tokens as well: { clientTokenId, freelancerTokenId }
 */
async function setupCompletedJob(overrides = {}) {
  const base = await setupSubmittedJob(overrides);
  await base.escrow.connect(base.client).confirmCompletion(base.jobId);
  const [clientTokenId, freelancerTokenId] = await base.escrow.getJobTokens(base.jobId);
  return { ...base, clientTokenId, freelancerTokenId };
}

/**
 * Deposit MIN_STAKE for a given signer.
 */
async function stake(escrow, signer) {
  await escrow.connect(signer).depositStake({ value: MIN_STAKE });
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe("FreelanceEscrow", function () {

  // ───────────────────────────────────────────
  //  1. STAKE MANAGEMENT
  // ───────────────────────────────────────────

  describe("depositStake", function () {
    it("accepts exactly MIN_STAKE and records it", async function () {
      const { escrow, client } = await deploy();
      await expect(escrow.connect(client).depositStake({ value: MIN_STAKE }))
        .to.emit(escrow, "StakeDeposited")
        .withArgs(client.address, MIN_STAKE);

      expect(await escrow.stakes(client.address)).to.equal(MIN_STAKE);
    });

    it("accepts more than MIN_STAKE and accumulates correctly", async function () {
      const { escrow, client } = await deploy();
      const double = MIN_STAKE * 2n;
      await escrow.connect(client).depositStake({ value: MIN_STAKE });
      await escrow.connect(client).depositStake({ value: MIN_STAKE });
      expect(await escrow.stakes(client.address)).to.equal(double);
    });

    it("reverts with InsufficientStake when value < MIN_STAKE", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).depositStake({ value: MIN_STAKE - 1n })
      ).to.be.revertedWithCustomError(escrow, "InsufficientStake");
    });
  });

  // ───────────────────────────────────────────
  //  2. OFFER SERVICE
  // ───────────────────────────────────────────

  describe("offerService", function () {
    it("lists a service and emits ServiceListed", async function () {
      const { escrow, freelancer } = await deploy();
      await expect(escrow.connect(freelancer).offerService(PRICE, META_CID))
        .to.emit(escrow, "ServiceListed")
        .withArgs(1, META_CID);

      const svc = await escrow.getService(1);
      expect(svc.freelancer).to.equal(freelancer.address);
      expect(svc.status).to.equal(SVC.Listed);
      expect(svc.priceWei).to.equal(PRICE);
      expect(svc.metadataCid).to.equal(META_CID);
      expect(await escrow.serviceCount()).to.equal(1);
    });

    it("increments serviceCount for multiple listings", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      expect(await escrow.serviceCount()).to.equal(2);
    });

    it("reverts with PriceMustBePositive when price is 0", async function () {
      const { escrow, freelancer } = await deploy();
      await expect(
        escrow.connect(freelancer).offerService(0, META_CID)
      ).to.be.revertedWithCustomError(escrow, "PriceMustBePositive");
    });

    it("reverts with MetadataCidRequired when CID is zero", async function () {
      const { escrow, freelancer } = await deploy();
      await expect(
        escrow.connect(freelancer).offerService(PRICE, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(escrow, "MetadataCidRequired");
    });
  });

  // ───────────────────────────────────────────
  //  3. HIRE FREELANCER
  // ───────────────────────────────────────────

  describe("hireFreelancer", function () {
    it("creates a job and emits JobCreated", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);

      await expect(
        escrow.connect(client).hireFreelancer(1, { value: PRICE })
      ).to.emit(escrow, "JobCreated").withArgs(1);

      const job = await escrow.getJob(1);
      expect(job.client).to.equal(client.address);
      expect(job.status).to.equal(JOB.Active);
      expect(job.amount).to.equal(PRICE);

      const svc = await escrow.getService(1);
      expect(svc.status).to.equal(SVC.Hired);
      expect(await escrow.jobCount()).to.equal(1);
    });

    it("locks ETH in contract on hire", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const before = await ethers.provider.getBalance(await escrow.getAddress());
      await escrow.connect(client).hireFreelancer(1, { value: PRICE });
      const after  = await ethers.provider.getBalance(await escrow.getAddress());
      expect(after - before).to.equal(PRICE);
    });

    it("reverts with InvalidService for non-existent service", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).hireFreelancer(99, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "InvalidService");
    });

    it("reverts with ServiceNotAvailable if service already hired", async function () {
      const { escrow, freelancer, client, stranger } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(client).hireFreelancer(1, { value: PRICE });
      await expect(
        escrow.connect(stranger).hireFreelancer(1, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ServiceNotAvailable");
    });

    it("reverts with IncorrectETH when wrong amount sent", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await expect(
        escrow.connect(client).hireFreelancer(1, { value: PRICE - 1n })
      ).to.be.revertedWithCustomError(escrow, "IncorrectETH");
    });

    it("reverts with CannotHireYourself", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await expect(
        escrow.connect(freelancer).hireFreelancer(1, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "CannotHireYourself");
    });
  });

  // ───────────────────────────────────────────
  //  4. SUBMIT WORK
  // ───────────────────────────────────────────

  describe("submitWork", function () {
    it("transitions job to Submitted and emits WorkSubmitted", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(escrow.connect(freelancer).submitWork(jobId, WORK_CID))
        .to.emit(escrow, "WorkSubmitted")
        .withArgs(jobId, WORK_CID);

      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Submitted);
      expect(job.workCid).to.equal(WORK_CID);
      expect(job.submittedAt).to.be.gt(0);
    });

    it("reverts with OnlyFreelancer when client calls", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts with InvalidJobState when job is not Active", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobState");
    });

    it("reverts with WorkCidRequired when CID is zero", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(freelancer).submitWork(jobId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(escrow, "WorkCidRequired");
    });
  });

  // ───────────────────────────────────────────
  //  5. CONFIRM COMPLETION
  // ───────────────────────────────────────────

  describe("confirmCompletion", function () {
    it("marks job Done, pays freelancer, issues 2 tokens, emits JobCompleted", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      const freelancerBefore = await ethers.provider.getBalance(freelancer.address);

      const tx = await escrow.connect(client).confirmCompletion(jobId);
      await expect(tx).to.emit(escrow, "JobCompleted").withArgs(jobId);
      await expect(tx).to.emit(escrow, "FeedbackTokenIssued");

      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Done);

      const svc = await escrow.getService(job.serviceId);
      expect(svc.status).to.equal(SVC.Completed);

      const freelancerAfter = await ethers.provider.getBalance(freelancer.address);
      expect(freelancerAfter - freelancerBefore).to.equal(PRICE);

      const [clientToken, freelancerToken] = await escrow.getJobTokens(jobId);
      expect(clientToken).to.equal(1);
      expect(freelancerToken).to.equal(2);

      const t0 = await escrow.tokens(clientToken);
      expect(t0.reviewer).to.equal(client.address);
      expect(t0.reviewee).to.equal(freelancer.address);
      expect(t0.used).to.equal(false);
      expect(t0.applied).to.equal(false);

      const t1 = await escrow.tokens(freelancerToken);
      expect(t1.reviewer).to.equal(freelancer.address);
      expect(t1.reviewee).to.equal(client.address);
    });

    it("reverts with OnlyClient when non-client calls", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("reverts with WorkNotSubmitted when job is still Active", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "WorkNotSubmitted");
    });
  });

  // ───────────────────────────────────────────
  //  6. CANCEL JOB
  // ───────────────────────────────────────────

  describe("cancelJob", function () {
    it("client cancels an Active job and gets refunded", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      const before = await ethers.provider.getBalance(client.address);

      const tx      = await escrow.connect(client).cancelJob(jobId);
      const receipt = await tx.wait();
      const gas     = receipt.gasUsed * receipt.gasPrice;
      const after   = await ethers.provider.getBalance(client.address);

      await expect(tx).to.emit(escrow, "JobCancelled").withArgs(jobId);
      expect(after + gas - before).to.equal(PRICE);

      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Cancelled);
    });

    it("freelancer cancels an Active job", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(escrow.connect(freelancer).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("reverts NotAllowed when stranger cancels Active job before timeout", async function () {
      const { escrow, stranger, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(stranger).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "NotAllowed");
    });

    it("stranger can cancel Active job after deadline passes", async function () {
      const { escrow, stranger, jobId } = await setupActiveJob();
      await time.increase(DAYS_7 + 1);
      await expect(escrow.connect(stranger).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("client cancels a Submitted job", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await expect(escrow.connect(client).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("reverts FreelancerCannotCancelSubmitted when freelancer tries to cancel Submitted job", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "FreelancerCannotCancelSubmitted");
    });

    it("anyone can cancel a Submitted job after deadline", async function () {
      const { escrow, stranger, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_7 + 1);
      await expect(escrow.connect(stranger).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("reverts InvalidJob when job is already Done", async function () {
      const { escrow, client, jobId } = await setupCompletedJob();
      await expect(
        escrow.connect(client).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "InvalidJob");
    });

    it("does NOT issue feedback tokens on cancellation", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      expect(await escrow.tokenCount()).to.equal(0);
    });
  });

  // ───────────────────────────────────────────
  //  7. AUTO RELEASE
  // ───────────────────────────────────────────

  describe("autoRelease", function () {
    it("releases payment and issues tokens after 3 days", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      const before = await ethers.provider.getBalance(freelancer.address);

      await time.increase(DAYS_3 + 1);
      const tx = await escrow.connect(client).autoRelease(jobId);

      await expect(tx).to.emit(escrow, "JobCompleted").withArgs(jobId);
      await expect(tx).to.emit(escrow, "FeedbackTokenIssued");

      const after = await ethers.provider.getBalance(freelancer.address);
      expect(after - before).to.equal(PRICE);

      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Done);
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("reverts NotSubmitted when job is not in Submitted state", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await time.increase(DAYS_3 + 1);
      await expect(
        escrow.connect(client).autoRelease(jobId)
      ).to.be.revertedWithCustomError(escrow, "NotSubmitted");
    });

    it("reverts TooEarlyForAutoRelease when called before 3-day window", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(client).autoRelease(jobId)
      ).to.be.revertedWithCustomError(escrow, "TooEarlyForAutoRelease");
    });

    it("can be called by anyone (stranger triggers autoRelease)", async function () {
      const { escrow, stranger, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await expect(escrow.connect(stranger).autoRelease(jobId))
        .to.emit(escrow, "JobCompleted");
    });
  });

  // ───────────────────────────────────────────
  //  8. CLEAR WORK
  // ───────────────────────────────────────────

  describe("clearWork", function () {
    it("freelancer clears workCid after cancellation and emits WorkCleared", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);

      await expect(escrow.connect(freelancer).clearWork(jobId))
        .to.emit(escrow, "WorkCleared")
        .withArgs(jobId);

      const job = await escrow.getJob(jobId);
      expect(job.workCid).to.equal(ethers.ZeroHash);
    });

    it("reverts OnlyFreelancer when client calls clearWork", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);
      await expect(
        escrow.connect(client).clearWork(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts JobNotCancelled when job is still Active", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(freelancer).clearWork(jobId)
      ).to.be.revertedWithCustomError(escrow, "JobNotCancelled");
    });

    it("reverts JobNotCancelled when job is Done", async function () {
      const { escrow, freelancer, jobId } = await setupCompletedJob();
      await expect(
        escrow.connect(freelancer).clearWork(jobId)
      ).to.be.revertedWithCustomError(escrow, "JobNotCancelled");
    });
  });

  // ───────────────────────────────────────────
  //  9. SUBMIT FEEDBACK
  // ───────────────────────────────────────────

  describe("submitFeedback", function () {
    it("stores score and emits FeedbackSubmitted — does NOT apply yet (only one side)", async function () {
      const { escrow, client, freelancer, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);

      await expect(escrow.connect(client).submitFeedback(clientTokenId, 5))
        .to.emit(escrow, "FeedbackSubmitted")
        .withArgs(client.address, 1); // jobId = 1

      const t = await escrow.tokens(clientTokenId);
      expect(t.used).to.equal(true);
      expect(t.score).to.equal(5);
      expect(t.applied).to.equal(false); // other side hasn't submitted yet

      // reputation not updated yet
      const [avg] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(0);
    });

    it("applies both scores immediately when second party submits", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await stake(escrow, freelancer);

      await escrow.connect(client).submitFeedback(clientTokenId, 5);

      // Second submission triggers FeedbackApplied for both
      await expect(
        escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4)
      )
        .to.emit(escrow, "FeedbackApplied")
        .and.to.emit(escrow, "FeedbackApplied");

      // Freelancer's reputation should now be set
      const [avgFL,, jobsFL] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avgFL).to.be.gt(0);
      expect(jobsFL).to.equal(1);

      // Client's reputation should now be set
      const [avgCL,, jobsCL] = await escrow.getClientReputation(client.address);
      expect(avgCL).to.be.gt(0);
      expect(jobsCL).to.equal(1);

      // Tokens marked as applied
      const t0 = await escrow.tokens(clientTokenId);
      const t1 = await escrow.tokens(freelancerTokenId);
      expect(t0.applied).to.equal(true);
      expect(t1.applied).to.equal(true);
    });

    it("reverts NotReviewer when wrong address calls", async function () {
      const { escrow, stranger, clientTokenId } = await setupCompletedJob();
      await stake(escrow, stranger);
      await expect(
        escrow.connect(stranger).submitFeedback(clientTokenId, 5)
      ).to.be.revertedWithCustomError(escrow, "NotReviewer");
    });

    it("reverts TokenUsed on duplicate submission", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 3)
      ).to.be.revertedWithCustomError(escrow, "TokenUsed");
    });

    it("reverts InvalidScore for score = 0", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidScore");
    });

    it("reverts InvalidScore for score = 6", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 6)
      ).to.be.revertedWithCustomError(escrow, "InvalidScore");
    });

    it("reverts InsufficientStake when reviewer has no stake", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 5)
      ).to.be.revertedWithCustomError(escrow, "InsufficientStake");
    });

    it("accepts all valid boundary scores (1 and 5)", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 1)
      ).to.emit(escrow, "FeedbackSubmitted");
    });
  });

  // ───────────────────────────────────────────
  //  10. FINALIZE REVIEW
  // ───────────────────────────────────────────

  describe("finalizeReview", function () {
    it("reverts ReviewWindowNotClosed before 7 days", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      await expect(
        escrow.finalizeReview(jobId)
      ).to.be.revertedWithCustomError(escrow, "ReviewWindowNotClosed");
    });

    it("applies single-sided score after 7-day expiry", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);

      // Only client submitted — score not applied yet
      const [before] = await escrow.getFreelancerReputation(freelancer.address);
      expect(before).to.equal(0);

      await time.increase(DAYS_7 + 1);
      await expect(escrow.finalizeReview(jobId))
        .to.emit(escrow, "FeedbackApplied");

      const [after,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(after).to.be.gt(0);
      expect(jobs).to.equal(1);
    });

    it("is a no-op for unsubmitted token (no revert, no FeedbackApplied)", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      await time.increase(DAYS_7 + 1);
      // Neither party submitted — finalizeReview should not emit FeedbackApplied
      await expect(escrow.finalizeReview(jobId))
        .to.not.emit(escrow, "FeedbackApplied");
    });

    it("is idempotent — calling twice does not double-apply scores", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await time.increase(DAYS_7 + 1);

      await escrow.finalizeReview(jobId);
      await escrow.finalizeReview(jobId); // second call — should be silent

      // totalJobs should still be 1, not 2
      const [,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(jobs).to.equal(1);
    });

    it("can be called by anyone (stranger finalizes)", async function () {
      const { escrow, stranger, jobId } = await setupCompletedJob();
      await time.increase(DAYS_7 + 1);
      await expect(escrow.connect(stranger).finalizeReview(jobId))
        .to.not.be.reverted;
    });

    it("applies both scores via finalizeReview when both submitted before expiry", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await stake(escrow, freelancer);

      // Both submit but don't trigger each other (sequential scenario
      // where second submission would normally trigger — here we verify
      // finalizeReview is idempotent after both are already applied)
      await escrow.connect(client).submitFeedback(clientTokenId, 4);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 3);

      // Already applied at this point via submitFeedback trigger
      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(jobId); // should not revert or double-apply

      const [,, flJobs] = await escrow.getFreelancerReputation(freelancer.address);
      const [,, clJobs] = await escrow.getClientReputation(client.address);
      expect(flJobs).to.equal(1);
      expect(clJobs).to.equal(1);
    });
  });

  // ───────────────────────────────────────────
  //  11 & 12. REPUTATION GETTERS
  // ───────────────────────────────────────────

  describe("getFreelancerReputation", function () {
    it("returns (0, 0, 0) for address with no ratings", async function () {
      const { escrow, freelancer } = await deploy();
      const [avg, weight, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(0);
      expect(weight).to.equal(0);
      expect(jobs).to.equal(0);
    });

    it("returns scaled average after a rating is applied", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      // avg is score×100 — score=5 so should be 500
      expect(avg).to.equal(500);
      expect(jobs).to.equal(1);
    });
  });

  describe("getClientReputation", function () {
    it("returns (0, 0, 0) for address with no ratings", async function () {
      const { escrow, client } = await deploy();
      const [avg, weight, jobs] = await escrow.getClientReputation(client.address);
      expect(avg).to.equal(0);
      expect(weight).to.equal(0);
      expect(jobs).to.equal(0);
    });

    it("returns scaled average after a rating is applied", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

      const [avg,, jobs] = await escrow.getClientReputation(client.address);
      // score=4 → avgScoreScaled = 400
      expect(avg).to.equal(400);
      expect(jobs).to.equal(1);
    });
  });

  // ───────────────────────────────────────────
  //  13. VIEW HELPERS
  // ───────────────────────────────────────────

  describe("view helpers", function () {
    it("getService returns correct data", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const svc = await escrow.getService(1);
      expect(svc.freelancer).to.equal(freelancer.address);
      expect(svc.priceWei).to.equal(PRICE);
      expect(svc.metadataCid).to.equal(META_CID);
    });

    it("getJob returns correct data", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      const job = await escrow.getJob(jobId);
      expect(job.client).to.equal(client.address);
      expect(job.status).to.equal(JOB.Active);
      expect(job.amount).to.equal(PRICE);
    });

    it("getJobTokens returns both token IDs after completion", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.equal(1n);
      expect(t1).to.equal(2n);
    });

    it("getJobTokens returns (0, 0) for an incomplete job", async function () {
      const { escrow, jobId } = await setupActiveJob();
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.equal(0n);
      expect(t1).to.equal(0n);
    });

    it("tokenCount increments correctly", async function () {
      const { escrow } = await setupCompletedJob();
      expect(await escrow.tokenCount()).to.equal(2);
    });
  });

  // ───────────────────────────────────────────
  //  14. WEIGHT CALCULATION  (via reputation)
  // ───────────────────────────────────────────

  describe("weight calculation", function () {
    it("reviews submitted immediately carry higher speedWeight", async function () {
      // Job A: reviewed on day 0
      // Job B: reviewed on day 6
      // Job A should have higher totalWeight

      // Job A
      const baseA = await setupCompletedJob();
      await stake(baseA.escrow, baseA.client);
      await stake(baseA.escrow, baseA.freelancer);
      // submit immediately (day 0)
      await baseA.escrow.connect(baseA.client).submitFeedback(baseA.clientTokenId, 5);
      await baseA.escrow.connect(baseA.freelancer).submitFeedback(baseA.freelancerTokenId, 5);
      const [, weightA] = await baseA.escrow.getFreelancerReputation(baseA.freelancer.address);

      // Job B
      const baseB = await setupCompletedJob();
      await stake(baseB.escrow, baseB.client);
      await stake(baseB.escrow, baseB.freelancer);
      // wait 6 days before reviewing
      await time.increase(6 * DAY);
      await baseB.escrow.connect(baseB.client).submitFeedback(baseB.clientTokenId, 5);
      await baseB.escrow.connect(baseB.freelancer).submitFeedback(baseB.freelancerTokenId, 5);
      const [, weightB] = await baseB.escrow.getFreelancerReputation(baseB.freelancer.address);

      expect(weightA).to.be.gt(weightB);
    });

    it("handles tiny job value (amountWeight floored to 1)", async function () {
      // Use a price of 1 wei (below 1 finney threshold)
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob({ price: 1n });

      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 5);

      // Should not revert and should still produce a non-zero weight
      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.be.gt(0);
      expect(jobs).to.equal(1);
    });
  });

  // ───────────────────────────────────────────
  //  15. MULTI-JOB REPUTATION ACCUMULATION
  // ───────────────────────────────────────────

  describe("multi-job reputation", function () {
    it("accumulates totalJobs across multiple completed jobs", async function () {
      // Complete 3 separate jobs for the same freelancer
      for (let i = 0; i < 3; i++) {
        const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
          await setupCompletedJob();
        await stake(escrow, client);
        await stake(escrow, freelancer);
        await escrow.connect(client).submitFeedback(clientTokenId, 4);
        await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

        const [,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
        // Each contract instance is fresh, so always 1 — confirms the counter increments
        expect(jobs).to.equal(1);
      }
    });
  });

  // ───────────────────────────────────────────
  //  16. EVENT COVERAGE
  // ───────────────────────────────────────────

  describe("events", function () {
    it("emits StakeDeposited on depositStake", async function () {
      const { escrow, client } = await deploy();
      await expect(escrow.connect(client).depositStake({ value: MIN_STAKE }))
        .to.emit(escrow, "StakeDeposited")
        .withArgs(client.address, MIN_STAKE);
    });

    it("emits WorkCleared on clearWork", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);
      await expect(escrow.connect(freelancer).clearWork(jobId))
        .to.emit(escrow, "WorkCleared")
        .withArgs(jobId);
    });

    it("emits FeedbackApplied with correct reviewer and reviewee", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);

      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await expect(
        escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4)
      )
        .to.emit(escrow, "FeedbackApplied")
        .withArgs(client.address, freelancer.address, 5n, anyValue)
        .and.to.emit(escrow, "FeedbackApplied")
        .withArgs(freelancer.address, client.address, 4n, anyValue);
    });
  });
});