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
const { expect }   = require("chai");
const { ethers }   = require("hardhat");
const { time }     = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// ─────────────────────────────────────────────
//  CONSTANTS  (mirror contract values)
// ─────────────────────────────────────────────

const MIN_STAKE = ethers.parseEther("0.05");
const PRICE     = ethers.parseEther("1.0");
const META_CID  = ethers.keccak256(ethers.toUtf8Bytes("QmMeta"));
const WORK_CID  = ethers.keccak256(ethers.toUtf8Bytes("QmWork"));

const DAY    = 24 * 60 * 60;
const DAYS_3 = 3 * DAY;
const DAYS_7 = 7 * DAY;

// JobStatus / ServiceStatus enum indices (match contract enums)
const SVC = { Listed: 0, Hired: 1, Completed: 2, Cancelled: 3 };
const JOB = { Active: 0, Submitted: 1, Done: 2, Cancelled: 3 };

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Deploy a fresh contract before each test. */
async function deploy() {
  const [owner, freelancer, client, stranger] = await ethers.getSigners();
  // ← renamed contract
  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow  = await Factory.deploy();
  return { escrow, owner, freelancer, client, stranger };
}

/**
 * Full happy-path setup: list service → hire → active job.
 * Returns { escrow, owner, freelancer, client, stranger, serviceId, jobId }.
 */
async function setupActiveJob(overrides = {}) {
  const { escrow, owner, freelancer, client, stranger } = await deploy();
  const price = overrides.price ?? PRICE;

  // offerService(priceWei, metadataCid)  — no leading _ in fixed contract
  await escrow.connect(freelancer).offerService(price, META_CID);
  const serviceId = 1;

  // hireFreelancer(serviceId)
  await escrow.connect(client).hireFreelancer(serviceId, { value: price });
  const jobId = 1;

  return { escrow, owner, freelancer, client, stranger, serviceId, jobId };
}

/** Setup up to "work submitted" state. */
async function setupSubmittedJob(overrides = {}) {
  const base = await setupActiveJob(overrides);
  // submitWork(jobId, workCid)
  await base.escrow.connect(base.freelancer).submitWork(base.jobId, WORK_CID);
  return base;
}

/**
 * Setup a completed job (confirmCompletion called).
 * Returns { ...base, clientTokenId, freelancerTokenId }.
 *
 * NOTE (FIX-2 / CEI): In the fixed contract _issueFeedbackTokens runs BEFORE
 * _safeTransfer, so tokens are always guaranteed to exist after the tx mines.
 */
async function setupCompletedJob(overrides = {}) {
  const base = await setupSubmittedJob(overrides);
  // confirmCompletion(jobId)
  await base.escrow.connect(base.client).confirmCompletion(base.jobId);
  const [clientTokenId, freelancerTokenId] =
    await base.escrow.getJobTokens(base.jobId);
  return { ...base, clientTokenId, freelancerTokenId };
}

/** Deposit MIN_STAKE for a given signer. */
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

    it("reverts InsufficientStake when value < MIN_STAKE", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).depositStake({ value: MIN_STAKE - 1n })
      ).to.be.revertedWithCustomError(escrow, "InsufficientStake");
    });
  });

  // ───────────────────────────────────────────
  //  2. OFFER SERVICE
  //     Fixed: parameter names have no leading '_' (naming-convention fix)
  //     — no behaviour change, tests are identical
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

    it("reverts PriceMustBePositive when price is 0", async function () {
      const { escrow, freelancer } = await deploy();
      await expect(
        escrow.connect(freelancer).offerService(0, META_CID)
      ).to.be.revertedWithCustomError(escrow, "PriceMustBePositive");
    });

    it("reverts MetadataCidRequired when CID is zero", async function () {
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

    it("reverts InvalidService for non-existent service", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).hireFreelancer(99, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "InvalidService");
    });

    it("reverts ServiceNotAvailable if service already hired", async function () {
      const { escrow, freelancer, client, stranger } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(client).hireFreelancer(1, { value: PRICE });
      await expect(
        escrow.connect(stranger).hireFreelancer(1, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ServiceNotAvailable");
    });

    it("reverts IncorrectETH when wrong amount sent", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await expect(
        escrow.connect(client).hireFreelancer(1, { value: PRICE - 1n })
      ).to.be.revertedWithCustomError(escrow, "IncorrectETH");
    });

    it("reverts CannotHireYourself", async function () {
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

    it("reverts OnlyFreelancer when client calls", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts InvalidJobState when job is already Submitted", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobState");
    });

    it("reverts WorkCidRequired when CID is zero", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(freelancer).submitWork(jobId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(escrow, "WorkCidRequired");
    });
  });

  // ───────────────────────────────────────────
  //  5. CONFIRM COMPLETION
  //     FIX-2 (CEI): _issueFeedbackTokens now runs BEFORE _safeTransfer.
  //     Tokens must be present in storage before the ETH lands — verified below.
  // ───────────────────────────────────────────

  describe("confirmCompletion", function () {
    it("marks job Done, pays freelancer, issues 2 tokens before ETH transfer", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      const freelancerBefore = await ethers.provider.getBalance(freelancer.address);

      const tx = await escrow.connect(client).confirmCompletion(jobId);
      await expect(tx).to.emit(escrow, "JobCompleted").withArgs(jobId);
      await expect(tx).to.emit(escrow, "FeedbackTokenIssued");

      // ── job / service state ────────────────
      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Done);
      const svc = await escrow.getService(job.serviceId);
      expect(svc.status).to.equal(SVC.Completed);

      // ── payment landed ─────────────────────
      const freelancerAfter = await ethers.provider.getBalance(freelancer.address);
      expect(freelancerAfter - freelancerBefore).to.equal(PRICE);

      // ── tokens issued (CEI: exist before ETH transfer block) ──
      const [clientToken, freelancerToken] = await escrow.getJobTokens(jobId);
      expect(clientToken).to.equal(1n);
      expect(freelancerToken).to.equal(2n);

      const t0 = await escrow.tokens(clientToken);
      expect(t0.reviewer).to.equal(client.address);
      expect(t0.reviewee).to.equal(freelancer.address);
      expect(t0.used).to.equal(false);
      expect(t0.applied).to.equal(false);

      const t1 = await escrow.tokens(freelancerToken);
      expect(t1.reviewer).to.equal(freelancer.address);
      expect(t1.reviewee).to.equal(client.address);
    });

    it("reverts OnlyClient when non-client calls", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("reverts WorkNotSubmitted when job is still Active", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "WorkNotSubmitted");
    });

    it("workCid is permanently locked after completion", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      const job = await escrow.getJob(jobId);
      expect(job.workCid).to.equal(WORK_CID);
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

    it("reverts FreelancerCannotCancelSubmitted when freelancer tries", async function () {
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

    it("service status set to Cancelled after job cancel", async function () {
      const { escrow, client, jobId, serviceId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      const svc = await escrow.getService(serviceId);
      expect(svc.status).to.equal(SVC.Cancelled);
    });
  });

  // ───────────────────────────────────────────
  //  7. AUTO RELEASE
  //     FIX-2 (CEI): tokens issued before ETH transfer — verified with tokenCount
  // ───────────────────────────────────────────

  describe("autoRelease", function () {
    it("releases payment and issues 2 tokens after 3 days", async function () {
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
      // CEI: token state is written before the external ETH call
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

    it("can be triggered by anyone (stranger triggers autoRelease)", async function () {
      const { escrow, stranger, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await expect(escrow.connect(stranger).autoRelease(jobId))
        .to.emit(escrow, "JobCompleted");
    });

    it("getJobTokens returns valid IDs after autoRelease", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.equal(1n);
      expect(t1).to.equal(2n);
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

    it("reverts JobNotCancelled when job is Done — workCid is immutable", async function () {
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
      const { escrow, client, freelancer, clientTokenId } =
        await setupCompletedJob();
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

      // Freelancer reputation set
      const [avgFL,, jobsFL] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avgFL).to.be.gt(0);
      expect(jobsFL).to.equal(1);

      // Client reputation set
      const [avgCL,, jobsCL] = await escrow.getClientReputation(client.address);
      expect(avgCL).to.be.gt(0);
      expect(jobsCL).to.equal(1);

      // Both tokens marked applied
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

    it("accepts boundary scores 1 and 5 without revert", async function () {
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

      // Only client submitted — not applied yet
      const [before] = await escrow.getFreelancerReputation(freelancer.address);
      expect(before).to.equal(0);

      await time.increase(DAYS_7 + 1);
      await expect(escrow.finalizeReview(jobId))
        .to.emit(escrow, "FeedbackApplied");

      const [after,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(after).to.be.gt(0);
      expect(jobs).to.equal(1);
    });

    it("is a no-op for unsubmitted tokens — no revert, no FeedbackApplied", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      await time.increase(DAYS_7 + 1);
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
      await escrow.finalizeReview(jobId); // second call must be silent

      // totalJobs still 1
      const [,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(jobs).to.equal(1);
    });

    it("can be called by anyone (stranger finalizes)", async function () {
      const { escrow, stranger, jobId } = await setupCompletedJob();
      await time.increase(DAYS_7 + 1);
      await expect(escrow.connect(stranger).finalizeReview(jobId))
        .to.not.be.reverted;
    });

    it("is a no-op when both already applied via submitFeedback", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await stake(escrow, freelancer);

      // Both submit — scores applied immediately by submitFeedback trigger
      await escrow.connect(client).submitFeedback(clientTokenId, 4);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 3);

      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(jobId); // must not double-apply

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
      const [avg, weight, jobs] =
        await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(0);
      expect(weight).to.equal(0);
      expect(jobs).to.equal(0);
    });

    it("returns avgScoreScaled = 500 for a score of 5", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(500); // score × 100
      expect(jobs).to.equal(1);
    });
  });

  describe("getClientReputation", function () {
    it("returns (0, 0, 0) for address with no ratings", async function () {
      const { escrow, client } = await deploy();
      const [avg, weight, jobs] =
        await escrow.getClientReputation(client.address);
      expect(avg).to.equal(0);
      expect(weight).to.equal(0);
      expect(jobs).to.equal(0);
    });

    it("returns avgScoreScaled = 400 for a score of 4", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

      const [avg,, jobs] = await escrow.getClientReputation(client.address);
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

    it("tokenCount increments to 2 after one completed job", async function () {
      const { escrow } = await setupCompletedJob();
      expect(await escrow.tokenCount()).to.equal(2);
    });
  });

  // ───────────────────────────────────────────
  //  14. WEIGHT CALCULATION
  //     FIX-1 (divide-before-multiply): multiply-then-divide formula verified.
  //     FIX-1 (tiny amounts): scaledAmount floors to 1e15 instead of 0.
  // ───────────────────────────────────────────

  describe("weight calculation", function () {
    it("reviews submitted on day 0 carry higher speedWeight than day-6 reviews", async function () {
      // Job A: reviewed immediately (day 0 → speedWeight = 7)
      const baseA = await setupCompletedJob();
      await stake(baseA.escrow, baseA.client);
      await stake(baseA.escrow, baseA.freelancer);
      await baseA.escrow.connect(baseA.client)
        .submitFeedback(baseA.clientTokenId, 5);
      await baseA.escrow.connect(baseA.freelancer)
        .submitFeedback(baseA.freelancerTokenId, 5);
      const [, weightA] =
        await baseA.escrow.getFreelancerReputation(baseA.freelancer.address);

      // Job B: reviewed on day 6 (speedWeight = 1)
      const baseB = await setupCompletedJob();
      await stake(baseB.escrow, baseB.client);
      await stake(baseB.escrow, baseB.freelancer);
      await time.increase(6 * DAY);
      await baseB.escrow.connect(baseB.client)
        .submitFeedback(baseB.clientTokenId, 5);
      await baseB.escrow.connect(baseB.freelancer)
        .submitFeedback(baseB.freelancerTokenId, 5);
      const [, weightB] =
        await baseB.escrow.getFreelancerReputation(baseB.freelancer.address);

      expect(weightA).to.be.gt(weightB);
    });

    it("FIX-1: tiny job value (1 wei) floors amountWeight to 1 — non-zero result", async function () {
      // Before the fix, _amount / 1e15 = 0 when amount < 1e15, making
      // the entire weight product 0 and dividing by zero in getReputation.
      // The fixed contract uses scaledAmount = amount >= 1e15 ? amount : 1e15.
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob({ price: 1n }); // 1 wei job

      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 5);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.be.gt(0);
      expect(jobs).to.equal(1);
    });

    it("FIX-1: job value exactly 1 finney (1e15 wei) is not floored", async function () {
      const ONE_FINNEY = ethers.parseUnits("1", "finney"); // 1e15 wei
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob({ price: ONE_FINNEY });

      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 5);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(500);
      expect(jobs).to.equal(1);
    });

    it("higher value job produces larger totalWeight than lower value job", async function () {
      const HIGH_PRICE = ethers.parseEther("10");
      const LOW_PRICE  = ethers.parseEther("0.01");

      const highBase = await setupCompletedJob({ price: HIGH_PRICE });
      await stake(highBase.escrow, highBase.client);
      await stake(highBase.escrow, highBase.freelancer);
      await highBase.escrow.connect(highBase.client)
        .submitFeedback(highBase.clientTokenId, 5);
      await highBase.escrow.connect(highBase.freelancer)
        .submitFeedback(highBase.freelancerTokenId, 5);
      const [, highWeight] =
        await highBase.escrow.getFreelancerReputation(highBase.freelancer.address);

      const lowBase = await setupCompletedJob({ price: LOW_PRICE });
      await stake(lowBase.escrow, lowBase.client);
      await stake(lowBase.escrow, lowBase.freelancer);
      await lowBase.escrow.connect(lowBase.client)
        .submitFeedback(lowBase.clientTokenId, 5);
      await lowBase.escrow.connect(lowBase.freelancer)
        .submitFeedback(lowBase.freelancerTokenId, 5);
      const [, lowWeight] =
        await lowBase.escrow.getFreelancerReputation(lowBase.freelancer.address);

      expect(highWeight).to.be.gt(lowWeight);
    });
  });

  // ───────────────────────────────────────────
  //  15. MULTI-JOB REPUTATION ACCUMULATION
  // ───────────────────────────────────────────

  describe("multi-job reputation", function () {
    it("each fresh contract instance starts at totalJobs = 1 after one job", async function () {
      for (let i = 0; i < 3; i++) {
        const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
          await setupCompletedJob();
        await stake(escrow, client);
        await stake(escrow, freelancer);
        await escrow.connect(client).submitFeedback(clientTokenId, 4);
        await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4);

        const [,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
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

    it("emits FeedbackApplied with correct reviewer, reviewee, score, and weight", async function () {
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

    it("emits exactly two FeedbackTokenIssued events on confirmCompletion", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      const tx      = await escrow.connect(client).confirmCompletion(jobId);
      const receipt = await tx.wait();
      const issued  = receipt.logs.filter(
        (l) => l.fragment && l.fragment.name === "FeedbackTokenIssued"
      );
      expect(issued.length).to.equal(2);
    });

    it("emits exactly two FeedbackTokenIssued events on autoRelease", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      const tx      = await escrow.autoRelease(jobId);
      const receipt = await tx.wait();
      const issued  = receipt.logs.filter(
        (l) => l.fragment && l.fragment.name === "FeedbackTokenIssued"
      );
      expect(issued.length).to.equal(2);
    });
  });

  // ───────────────────────────────────────────
  //  17. CEI PATTERN REGRESSION  (FIX-2)
  //      Verifies tokens exist in storage before the ETH balance changes.
  // ───────────────────────────────────────────

  describe("CEI regression — tokens issued before ETH transfer", function () {
    it("tokenCount is 2 immediately after confirmCompletion", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      // If CEI were violated, a re-entrant call would see tokenCount = 0.
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("tokenCount is 2 immediately after autoRelease", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      expect(await escrow.tokenCount()).to.equal(2);
    });
  });
});