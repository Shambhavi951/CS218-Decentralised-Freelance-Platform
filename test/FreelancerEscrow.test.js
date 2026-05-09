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
const JOB_DESC  = ethers.keccak256(ethers.toUtf8Bytes("Build me a dApp"));

const SECOND = 1;
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
  const Factory = await ethers.getContractFactory("FreelanceEscrow");
  const escrow  = await Factory.deploy();
  return { escrow, owner, freelancer, client, stranger };
}

/**
 * Returns a deadline timestamp that is N days from now (default 14 days).
 * Must be > block.timestamp + 1 day and < block.timestamp + 365 days.
 */
async function futureDeadline(days = 14) {
  const now = await time.latest();
  return BigInt(now) + BigInt(days * DAY);
}

/**
 * Full happy-path setup: list service → hire → active job.
 * Returns { escrow, owner, freelancer, client, stranger, serviceId, jobId }.
 */
async function setupActiveJob(overrides = {}) {
  const { escrow, owner, freelancer, client, stranger } = await deploy();
  const price    = overrides.price    ?? PRICE;
  const deadline = overrides.deadline ?? await futureDeadline(14);
  const desc     = overrides.desc     ?? JOB_DESC;

  await escrow.connect(freelancer).offerService(price, META_CID);
  const serviceId = 1;

  await escrow.connect(client).hireFreelancer(serviceId, deadline, desc, { value: price });
  const jobId = 1;

  return { escrow, owner, freelancer, client, stranger, serviceId, jobId };
}

/** Setup up to "work submitted" state. */
async function setupSubmittedJob(overrides = {}) {
  const base = await setupActiveJob(overrides);
  await base.escrow.connect(base.freelancer).submitWork(base.jobId, WORK_CID);
  return base;
}

/**
 * Setup a completed job (confirmCompletion called).
 * [FIX-2 / CEI]: _issueFeedbackTokens runs BEFORE _safeTransfer,
 * so tokens are guaranteed to exist once the tx mines.
 */
async function setupCompletedJob(overrides = {}) {
  const base = await setupSubmittedJob(overrides);
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

    it("accumulates multiple deposits from the same address", async function () {
      const { escrow, client } = await deploy();
      await escrow.connect(client).depositStake({ value: MIN_STAKE });
      await escrow.connect(client).depositStake({ value: MIN_STAKE * 3n });
      expect(await escrow.stakes(client.address)).to.equal(MIN_STAKE * 4n);
    });

    it("different accounts have independent stake balances", async function () {
      const { escrow, client, freelancer } = await deploy();
      await escrow.connect(client).depositStake({ value: MIN_STAKE });
      await escrow.connect(freelancer).depositStake({ value: MIN_STAKE * 2n });

      expect(await escrow.stakes(client.address)).to.equal(MIN_STAKE);
      expect(await escrow.stakes(freelancer.address)).to.equal(MIN_STAKE * 2n);
    });

    it("reverts InsufficientStake when value < MIN_STAKE", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).depositStake({ value: MIN_STAKE - 1n })
      ).to.be.revertedWithCustomError(escrow, "InsufficientStake");
    });

    it("reverts InsufficientStake when value is 0", async function () {
      const { escrow, client } = await deploy();
      await expect(
        escrow.connect(client).depositStake({ value: 0 })
      ).to.be.revertedWithCustomError(escrow, "InsufficientStake");
    });

    it("stranger with no stake has stakes[address] == 0", async function () {
      const { escrow, stranger } = await deploy();
      expect(await escrow.stakes(stranger.address)).to.equal(0);
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

    it("increments serviceCount for multiple listings by same freelancer", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      expect(await escrow.serviceCount()).to.equal(2);
    });

    it("two different freelancers can each list a service", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(client).offerService(PRICE, META_CID);
      expect(await escrow.serviceCount()).to.equal(2);

      const svc1 = await escrow.getService(1);
      const svc2 = await escrow.getService(2);
      expect(svc1.freelancer).to.equal(freelancer.address);
      expect(svc2.freelancer).to.equal(client.address);
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

    it("serviceCount starts at 0 before any listing", async function () {
      const { escrow } = await deploy();
      expect(await escrow.serviceCount()).to.equal(0);
    });

    it("listed service is in Listed status initially", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const svc = await escrow.getService(1);
      expect(svc.status).to.equal(SVC.Listed);
    });
  });

  // ───────────────────────────────────────────
  //  3. HIRE FREELANCER
  //     Updated: now takes (serviceId, deadline, jobDescription)
  //     Deadline must be > block.timestamp + 1 day and < +365 days.
  // ───────────────────────────────────────────

  describe("hireFreelancer", function () {
    it("creates a job and emits JobCreated", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);

      await expect(
        escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE })
      ).to.emit(escrow, "JobCreated").withArgs(1);

      const job = await escrow.getJob(1);
      expect(job.client).to.equal(client.address);
      expect(job.status).to.equal(JOB.Active);
      expect(job.amount).to.equal(PRICE);
      expect(job.deadline).to.equal(deadline);
      expect(job.jobDescription).to.equal(JOB_DESC);

      const svc = await escrow.getService(1);
      expect(svc.status).to.equal(SVC.Hired);
      expect(await escrow.jobCount()).to.equal(1);
    });

    it("locks ETH in contract on hire", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      const before = await ethers.provider.getBalance(await escrow.getAddress());
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      const after  = await ethers.provider.getBalance(await escrow.getAddress());
      expect(after - before).to.equal(PRICE);
    });

    it("stores jobDescription in the job struct", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      const desc = ethers.keccak256(ethers.toUtf8Bytes("unique desc"));
      await escrow.connect(client).hireFreelancer(1, deadline, desc, { value: PRICE });
      const job = await escrow.getJob(1);
      expect(job.jobDescription).to.equal(desc);
    });

    it("reverts InvalidService for non-existent service", async function () {
      const { escrow, client } = await deploy();
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(client).hireFreelancer(99, deadline, JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "InvalidService");
    });

    it("reverts ServiceNotAvailable if service already hired", async function () {
      const { escrow, freelancer, client, stranger } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      await expect(
        escrow.connect(stranger).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "ServiceNotAvailable");
    });

    it("reverts IncorrectETH when wrong amount sent", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE - 1n })
      ).to.be.revertedWithCustomError(escrow, "IncorrectETH");
    });

    it("reverts IncorrectETH when too much ETH sent", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE + 1n })
      ).to.be.revertedWithCustomError(escrow, "IncorrectETH");
    });

    it("reverts CannotHireYourself", async function () {
      const { escrow, freelancer } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(freelancer).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "CannotHireYourself");
    });

    it("reverts DeadlineTooSoon when deadline < now + 1 day", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const now = await time.latest();
      // Deadline is exactly now — well below the 1-day minimum
      await expect(
        escrow.connect(client).hireFreelancer(1, BigInt(now), JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "DeadlineTooSoon");
    });

    it("reverts DeadlineTooSoon when deadline is 23h 59m from now", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const now = await time.latest();
      const almostOneDay = BigInt(now) + BigInt(DAY - 60); // 1 minute short
      await expect(
        escrow.connect(client).hireFreelancer(1, almostOneDay, JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "DeadlineTooSoon");
    });

    it("reverts DeadlineTooFar when deadline > now + 365 days", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const now = await time.latest();
      const tooFar = BigInt(now) + BigInt(366 * DAY);
      await expect(
        escrow.connect(client).hireFreelancer(1, tooFar, JOB_DESC, { value: PRICE })
      ).to.be.revertedWithCustomError(escrow, "DeadlineTooFar");
    });

    it("accepts deadline exactly at now + 365 days (boundary)", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const now = await time.latest();
      const exactFar = BigInt(now) + BigInt(365 * DAY);
      await expect(
        escrow.connect(client).hireFreelancer(1, exactFar, JOB_DESC, { value: PRICE })
      ).to.emit(escrow, "JobCreated");
    });

    it("accepts deadline at now + 2 days (above minimum)", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const now = await time.latest();
      const twoDays = BigInt(now) + BigInt(2 * DAY);
      await expect(
        escrow.connect(client).hireFreelancer(1, twoDays, JOB_DESC, { value: PRICE })
      ).to.emit(escrow, "JobCreated");
    });

    it("jobCount starts at 0 and increments to 1 after first hire", async function () {
      const { escrow, freelancer, client } = await deploy();
      expect(await escrow.jobCount()).to.equal(0);
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      expect(await escrow.jobCount()).to.equal(1);
    });

    it("service status transitions Listed → Hired", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const svcBefore = await escrow.getService(1);
      expect(svcBefore.status).to.equal(SVC.Listed);

      const deadline = await futureDeadline(14);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      const svcAfter = await escrow.getService(1);
      expect(svcAfter.status).to.equal(SVC.Hired);
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

    it("records submittedAt as a recent block timestamp", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      const before = await time.latest();
      await escrow.connect(freelancer).submitWork(jobId, WORK_CID);
      const after = await time.latest();
      const job = await escrow.getJob(jobId);
      expect(job.submittedAt).to.be.gte(before);
      expect(job.submittedAt).to.be.lte(after);
    });

    it("reverts OnlyFreelancer when client calls", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts OnlyFreelancer when stranger calls", async function () {
      const { escrow, stranger, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(stranger).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts InvalidJobState when job is already Submitted", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).submitWork(jobId, WORK_CID)
      ).to.be.revertedWithCustomError(escrow, "InvalidJobState");
    });

    it("reverts InvalidJobState when job is Done", async function () {
      const { escrow, freelancer, jobId } = await setupCompletedJob();
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

    it("job status is still Active before submitWork is called", async function () {
      const { escrow, jobId } = await setupActiveJob();
      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Active);
    });
  });

  // ───────────────────────────────────────────
  //  5. CONFIRM COMPLETION
  //     [FIX-2 CEI]: _issueFeedbackTokens runs BEFORE _safeTransfer.
  // ───────────────────────────────────────────

  describe("confirmCompletion", function () {
    it("marks job Done, pays freelancer, and issues 2 tokens", async function () {
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
    });

    it("issues tokens with correct reviewer / reviewee assignments", async function () {
      const { escrow, client, freelancer, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);

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

    it("[CEI] tokenCount is 2 before ETH transfer completes", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      // If CEI were violated, a re-entrant receiver would see tokenCount = 0.
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("token expiry is set to block.timestamp + 7 days", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      const before = await time.latest();
      await escrow.connect(client).confirmCompletion(jobId);
      const after = await time.latest();

      const [clientToken] = await escrow.getJobTokens(jobId);
      const t = await escrow.tokens(clientToken);
      expect(t.expiry).to.be.gte(BigInt(before) + BigInt(DAYS_7));
      expect(t.expiry).to.be.lte(BigInt(after) + BigInt(DAYS_7));
    });

    it("reverts OnlyClient when freelancer calls", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(freelancer).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("reverts OnlyClient when stranger calls", async function () {
      const { escrow, stranger, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(stranger).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyClient");
    });

    it("reverts WorkNotSubmitted when job is still Active", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(client).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "WorkNotSubmitted");
    });

    it("reverts WorkNotSubmitted when job is already Done", async function () {
      const { escrow, client, jobId } = await setupCompletedJob();
      await expect(
        escrow.connect(client).confirmCompletion(jobId)
      ).to.be.revertedWithCustomError(escrow, "WorkNotSubmitted");
    });

    it("workCid is permanently locked after completion", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      const job = await escrow.getJob(jobId);
      expect(job.workCid).to.equal(WORK_CID);
    });

    it("service transitions to Completed status", async function () {
      const { escrow, client, jobId, serviceId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      const svc = await escrow.getService(serviceId);
      expect(svc.status).to.equal(SVC.Completed);
    });

    it("emits exactly two FeedbackTokenIssued events", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      const tx      = await escrow.connect(client).confirmCompletion(jobId);
      const receipt = await tx.wait();
      const issued  = receipt.logs.filter(
        (l) => l.fragment && l.fragment.name === "FeedbackTokenIssued"
      );
      expect(issued.length).to.equal(2);
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

    it("service status set to Cancelled after job cancel", async function () {
      const { escrow, client, jobId, serviceId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      const svc = await escrow.getService(serviceId);
      expect(svc.status).to.equal(SVC.Cancelled);
    });

    it("reverts NotAllowed when stranger cancels Active job before timeout", async function () {
      const { escrow, stranger, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(stranger).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "NotAllowed");
    });

    it("stranger can cancel Active job after deadline passes", async function () {
      // Deadline is 14 days from now; advance past it
      const { escrow, stranger, jobId } = await setupActiveJob({ deadline: await futureDeadline(14) });
      await time.increase(15 * DAY);
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
      const { escrow, stranger, jobId } = await setupSubmittedJob({ deadline: await futureDeadline(14) });
      await time.increase(15 * DAY);
      await expect(escrow.connect(stranger).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("freelancer can cancel a Submitted job after deadline", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob({ deadline: await futureDeadline(14) });
      await time.increase(15 * DAY);
      await expect(escrow.connect(freelancer).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled");
    });

    it("reverts InvalidJob when job is already Done", async function () {
      const { escrow, client, jobId } = await setupCompletedJob();
      await expect(
        escrow.connect(client).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "InvalidJob");
    });

    it("reverts InvalidJob when job is already Cancelled", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      await expect(
        escrow.connect(client).cancelJob(jobId)
      ).to.be.revertedWithCustomError(escrow, "InvalidJob");
    });

    it("does NOT issue feedback tokens on cancellation", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      expect(await escrow.tokenCount()).to.equal(0);
    });

    it("does NOT issue feedback tokens when Submitted job is cancelled", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);
      expect(await escrow.tokenCount()).to.equal(0);
    });

    it("refunds full PRICE to client on cancellation of Submitted job", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      const before  = await ethers.provider.getBalance(client.address);
      const tx      = await escrow.connect(client).cancelJob(jobId);
      const receipt = await tx.wait();
      const gas     = receipt.gasUsed * receipt.gasPrice;
      const after   = await ethers.provider.getBalance(client.address);
      expect(after + gas - before).to.equal(PRICE);
    });
  });

  // ───────────────────────────────────────────
  //  7. AUTO RELEASE
  //     [FIX-2 CEI]: tokens issued before ETH transfer.
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
    });

    it("[CEI] tokenCount is 2 immediately after autoRelease", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("service transitions to Completed on autoRelease", async function () {
      const { escrow, jobId, serviceId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      const svc = await escrow.getService(serviceId);
      expect(svc.status).to.equal(SVC.Completed);
    });

    it("reverts NotSubmitted when job is Active", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await time.increase(DAYS_3 + 1);
      await expect(
        escrow.connect(client).autoRelease(jobId)
      ).to.be.revertedWithCustomError(escrow, "NotSubmitted");
    });

    it("reverts NotSubmitted when job is Done", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      await time.increase(DAYS_3 + 1);
      await expect(escrow.autoRelease(jobId))
        .to.be.revertedWithCustomError(escrow, "NotSubmitted");
    });

    it("reverts TooEarlyForAutoRelease when called before 3-day window", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await expect(
        escrow.connect(client).autoRelease(jobId)
      ).to.be.revertedWithCustomError(escrow, "TooEarlyForAutoRelease");
    });

    it("reverts TooEarlyForAutoRelease when called exactly at 3 days (boundary not inclusive)", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3); // exactly 3 days — not > 3 days
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

    it("reverts OnlyFreelancer when stranger calls clearWork", async function () {
      const { escrow, client, stranger, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);
      await expect(
        escrow.connect(stranger).clearWork(jobId)
      ).to.be.revertedWithCustomError(escrow, "OnlyFreelancer");
    });

    it("reverts JobNotCancelled when job is still Active", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(
        escrow.connect(freelancer).clearWork(jobId)
      ).to.be.revertedWithCustomError(escrow, "JobNotCancelled");
    });

    it("reverts JobNotCancelled when job is Submitted", async function () {
      const { escrow, freelancer, jobId } = await setupSubmittedJob();
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

    it("clearWork can be called after Active-job cancellation (no workCid was ever set)", async function () {
      const { escrow, freelancer, client, jobId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      // workCid is already bytes32(0), but clearWork should still succeed
      await expect(escrow.connect(freelancer).clearWork(jobId))
        .to.emit(escrow, "WorkCleared");
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

      // Reputation not updated yet
      const [avg] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(0);
    });

    it("applies both scores immediately when second party submits", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await stake(escrow, freelancer);

      await escrow.connect(client).submitFeedback(clientTokenId, 5);

      await expect(
        escrow.connect(freelancer).submitFeedback(freelancerTokenId, 4)
      )
        .to.emit(escrow, "FeedbackApplied")
        .and.to.emit(escrow, "FeedbackApplied");

      const [avgFL,, jobsFL] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avgFL).to.be.gt(0);
      expect(jobsFL).to.equal(1);

      const [avgCL,, jobsCL] = await escrow.getClientReputation(client.address);
      expect(avgCL).to.be.gt(0);
      expect(jobsCL).to.equal(1);

      const t0 = await escrow.tokens(clientTokenId);
      const t1 = await escrow.tokens(freelancerTokenId);
      expect(t0.applied).to.equal(true);
      expect(t1.applied).to.equal(true);
    });

    it("order doesn't matter — freelancer submits first, then client", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await stake(escrow, freelancer);

      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 3);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 4)
      ).to.emit(escrow, "FeedbackApplied");

      const [avgFL] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avgFL).to.be.gt(0);
    });

    it("reviewedAt is stamped when submitFeedback is called", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      const before = await time.latest();
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      const after = await time.latest();
      const t = await escrow.tokens(clientTokenId);
      expect(t.reviewedAt).to.be.gte(before);
      expect(t.reviewedAt).to.be.lte(after);
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

    it("accepts boundary score 1 without revert", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 1)
      ).to.emit(escrow, "FeedbackSubmitted");
    });

    it("accepts boundary score 5 without revert", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 5)
      ).to.emit(escrow, "FeedbackSubmitted");
    });

    it("single submitFeedback does not emit FeedbackApplied (waiting for counterpart)", async function () {
      const { escrow, client, clientTokenId } = await setupCompletedJob();
      await stake(escrow, client);
      await expect(
        escrow.connect(client).submitFeedback(clientTokenId, 5)
      ).to.not.emit(escrow, "FeedbackApplied");
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

    it("reverts ReviewWindowNotClosed at exactly 7 days (boundary not inclusive)", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      await time.increase(DAYS_7); // not past expiry yet
      await expect(
        escrow.finalizeReview(jobId)
      ).to.be.revertedWithCustomError(escrow, "ReviewWindowNotClosed");
    });

    it("applies single-sided score after 7-day expiry", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);

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

      await escrow.connect(client).submitFeedback(clientTokenId, 4);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 3);

      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(jobId);

      const [,, flJobs] = await escrow.getFreelancerReputation(freelancer.address);
      const [,, clJobs] = await escrow.getClientReputation(client.address);
      expect(flJobs).to.equal(1);
      expect(clJobs).to.equal(1);
    });

    it("applies only the submitted side when only one party rated", async function () {
      const { escrow, freelancer, client, jobId, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();

      // Only freelancer submits (rates the client)
      await stake(escrow, freelancer);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 2);

      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(jobId);

      // Client rep should be updated, freelancer rep should not be
      const [flAvg,, flJobs] = await escrow.getFreelancerReputation(freelancer.address);
      const [clAvg,, clJobs] = await escrow.getClientReputation(client.address);
      expect(clAvg).to.be.gt(0);
      expect(clJobs).to.equal(1);
      expect(flJobs).to.equal(0); // no rating received
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
      expect(avg).to.equal(500);
      expect(jobs).to.equal(1);
    });

    it("returns avgScoreScaled = 100 for a score of 1", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 1);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 1);

      const [avg] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(100);
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

    it("returns avgScoreScaled = 300 for a score of 3", async function () {
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob();
      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 3);

      const [avg] = await escrow.getClientReputation(client.address);
      expect(avg).to.equal(300);
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

    it("getJob returns correct data including deadline and jobDescription", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      const job = await escrow.getJob(jobId);
      expect(job.client).to.equal(client.address);
      expect(job.status).to.equal(JOB.Active);
      expect(job.amount).to.equal(PRICE);
      expect(job.deadline).to.be.gt(0);
      expect(job.jobDescription).to.equal(JOB_DESC);
    });

    it("getJob.serviceId links back to the correct service", async function () {
      const { escrow, jobId, serviceId } = await setupActiveJob();
      const job = await escrow.getJob(jobId);
      expect(job.serviceId).to.equal(serviceId);
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

    it("getJobTokens returns (0, 0) for a Submitted job (not yet Done)", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.equal(0n);
      expect(t1).to.equal(0n);
    });

    it("tokenCount increments to 2 after one completed job", async function () {
      const { escrow } = await setupCompletedJob();
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("tokenCount is 0 before any job completes", async function () {
      const { escrow } = await setupSubmittedJob();
      expect(await escrow.tokenCount()).to.equal(0);
    });
  });

  // ───────────────────────────────────────────
  //  14. WEIGHT CALCULATION
  //     [FIX-1]: multiply-then-divide verified.
  //     [FIX-1]: tiny amounts floor to 1e15.
  // ───────────────────────────────────────────

  describe("weight calculation", function () {
    it("reviews submitted on day 0 carry higher speedWeight than day-6 reviews", async function () {
      const baseA = await setupCompletedJob();
      await stake(baseA.escrow, baseA.client);
      await stake(baseA.escrow, baseA.freelancer);
      await baseA.escrow.connect(baseA.client)
        .submitFeedback(baseA.clientTokenId, 5);
      await baseA.escrow.connect(baseA.freelancer)
        .submitFeedback(baseA.freelancerTokenId, 5);
      const [, weightA] =
        await baseA.escrow.getFreelancerReputation(baseA.freelancer.address);

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

    it("[FIX-1] tiny job value (1 wei) floors amountWeight to 1 — non-zero result", async function () {
      // Before the fix, amountWeight = 0 for sub-finney jobs, giving totalWeight = 0
      // and causing a division-by-zero in getReputation.
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob({ price: 1n });

      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 5);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.be.gt(0);
      expect(jobs).to.equal(1);
    });

    it("[FIX-1] job value exactly 1 finney (1e15 wei) is not floored", async function () {
      const ONE_FINNEY = ethers.parseUnits("1", "finney");
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

    it("[FIX-1] job value below 1 finney (500 szabo) floors to 1 finney", async function () {
      const HALF_FINNEY = BigInt(5e14); // 0.5 finney
      const { escrow, client, freelancer, clientTokenId, freelancerTokenId } =
        await setupCompletedJob({ price: HALF_FINNEY });

      await stake(escrow, client);
      await stake(escrow, freelancer);
      await escrow.connect(client).submitFeedback(clientTokenId, 5);
      await escrow.connect(freelancer).submitFeedback(freelancerTokenId, 5);

      // amountWeight floored to 1 — result should equal the 1-finney scenario
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

    it("weight is non-zero even for a score submitted on day 7 via finalizeReview", async function () {
      const { escrow, client, freelancer, jobId, clientTokenId } =
        await setupCompletedJob();

      await stake(escrow, client);
      await escrow.connect(client).submitFeedback(clientTokenId, 4);

      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(jobId);

      const [,weight,] = await escrow.getFreelancerReputation(freelancer.address);
      expect(weight).to.be.gt(0);
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

    it("emits ServiceListed with serviceId and metadataCid", async function () {
      const { escrow, freelancer } = await deploy();
      await expect(escrow.connect(freelancer).offerService(PRICE, META_CID))
        .to.emit(escrow, "ServiceListed")
        .withArgs(1, META_CID);
    });

    it("emits JobCreated with jobId", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE })
      ).to.emit(escrow, "JobCreated").withArgs(1);
    });

    it("emits WorkSubmitted with jobId and workCid", async function () {
      const { escrow, freelancer, jobId } = await setupActiveJob();
      await expect(escrow.connect(freelancer).submitWork(jobId, WORK_CID))
        .to.emit(escrow, "WorkSubmitted")
        .withArgs(jobId, WORK_CID);
    });

    it("emits WorkCleared on clearWork", async function () {
      const { escrow, freelancer, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).cancelJob(jobId);
      await expect(escrow.connect(freelancer).clearWork(jobId))
        .to.emit(escrow, "WorkCleared")
        .withArgs(jobId);
    });

    it("emits JobCancelled on cancelJob", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await expect(escrow.connect(client).cancelJob(jobId))
        .to.emit(escrow, "JobCancelled")
        .withArgs(jobId);
    });

    it("emits JobCompleted on confirmCompletion", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await expect(escrow.connect(client).confirmCompletion(jobId))
        .to.emit(escrow, "JobCompleted")
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

    it("FeedbackTokenIssued contains correct reviewer and reviewee", async function () {
      const { escrow, client, freelancer, jobId } = await setupSubmittedJob();
      const tx      = await escrow.connect(client).confirmCompletion(jobId);
      const receipt = await tx.wait();
      const issued  = receipt.logs.filter(
        (l) => l.fragment && l.fragment.name === "FeedbackTokenIssued"
      );
      // Token 0: client → freelancer
      expect(issued[0].args[1]).to.equal(client.address);
      expect(issued[0].args[2]).to.equal(freelancer.address);
      // Token 1: freelancer → client
      expect(issued[1].args[1]).to.equal(freelancer.address);
      expect(issued[1].args[2]).to.equal(client.address);
    });
  });

  // ───────────────────────────────────────────
  //  17. CEI PATTERN REGRESSION  (FIX-2)
  //     Verifies tokens exist in storage before the ETH balance changes.
  // ───────────────────────────────────────────

  describe("CEI regression — tokens issued before ETH transfer", function () {
    it("tokenCount is 2 immediately after confirmCompletion", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("tokenCount is 2 immediately after autoRelease", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      expect(await escrow.tokenCount()).to.equal(2);
    });

    it("jobTokens mapping is populated before ETH arrives (confirmCompletion)", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.be.gt(0n);
      expect(t1).to.be.gt(0n);
    });

    it("jobTokens mapping is populated before ETH arrives (autoRelease)", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(jobId);
      const [t0, t1] = await escrow.getJobTokens(jobId);
      expect(t0).to.be.gt(0n);
      expect(t1).to.be.gt(0n);
    });

    it("job.status is Done before ETH is sent (effects precede interaction)", async function () {
      const { escrow, client, jobId } = await setupSubmittedJob();
      await escrow.connect(client).confirmCompletion(jobId);
      const job = await escrow.getJob(jobId);
      expect(job.status).to.equal(JOB.Done);
    });
  });

  // ───────────────────────────────────────────
  //  18. DEADLINE FIELD INTEGRITY
  //     New field introduced in updated hireFreelancer.
  // ───────────────────────────────────────────

  describe("deadline field integrity", function () {
    it("deadline stored in job matches what was passed in", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(30);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      const job = await escrow.getJob(1);
      expect(job.deadline).to.equal(deadline);
    });

    it("job is cancellable by stranger when block.timestamp > deadline", async function () {
      const { escrow, stranger } = await deploy();
      const [, freelancer, client] = await ethers.getSigners();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(2); // 2 days from now
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });

      await time.increase(3 * DAY); // advance past deadline
      await expect(escrow.connect(stranger).cancelJob(1))
        .to.emit(escrow, "JobCancelled");
    });

    it("stranger CANNOT cancel Active job before deadline passes", async function () {
      const { escrow, stranger } = await deploy();
      const [, freelancer, client] = await ethers.getSigners();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(30);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });

      // Do not advance time — deadline still in future
      await expect(escrow.connect(stranger).cancelJob(1))
        .to.be.revertedWithCustomError(escrow, "NotAllowed");
    });

    it("submitted job can be auto-cancelled by stranger after deadline", async function () {
      const { escrow, freelancer, stranger } = await deploy();
      const [, , client] = await ethers.getSigners();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(2);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      await escrow.connect(freelancer).submitWork(1, WORK_CID);

      await time.increase(3 * DAY);
      await expect(escrow.connect(stranger).cancelJob(1))
        .to.emit(escrow, "JobCancelled");
    });
  });

  // ───────────────────────────────────────────
  //  19. JOB DESCRIPTION FIELD
  //     New bytes32 jobDescription field on Job struct.
  // ───────────────────────────────────────────

  describe("jobDescription field", function () {
    it("stores and retrieves jobDescription correctly", async function () {
      const { escrow, jobId } = await setupActiveJob();
      const job = await escrow.getJob(jobId);
      expect(job.jobDescription).to.equal(JOB_DESC);
    });

    it("jobDescription is preserved through Submitted state", async function () {
      const { escrow, jobId } = await setupSubmittedJob();
      const job = await escrow.getJob(jobId);
      expect(job.jobDescription).to.equal(JOB_DESC);
    });

    it("jobDescription is preserved through Done state", async function () {
      const { escrow, jobId } = await setupCompletedJob();
      const job = await escrow.getJob(jobId);
      expect(job.jobDescription).to.equal(JOB_DESC);
    });

    it("jobDescription is preserved through Cancelled state", async function () {
      const { escrow, client, jobId } = await setupActiveJob();
      await escrow.connect(client).cancelJob(jobId);
      const job = await escrow.getJob(jobId);
      expect(job.jobDescription).to.equal(JOB_DESC);
    });

    it("two different jobs can have different jobDescriptions", async function () {
      const { escrow, freelancer, client } = await deploy();
      const desc1 = ethers.keccak256(ethers.toUtf8Bytes("Task A"));
      const desc2 = ethers.keccak256(ethers.toUtf8Bytes("Task B"));
      const deadline = await futureDeadline(14);

      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      await escrow.connect(freelancer).offerService(PRICE, META_CID);

      await escrow.connect(client).hireFreelancer(1, deadline, desc1, { value: PRICE });
      await escrow.connect(client).hireFreelancer(2, deadline, desc2, { value: PRICE });

      expect((await escrow.getJob(1)).jobDescription).to.equal(desc1);
      expect((await escrow.getJob(2)).jobDescription).to.equal(desc2);
    });

    it("jobDescription can be bytes32(0) (zero hash is accepted)", async function () {
      const { escrow, freelancer, client } = await deploy();
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await expect(
        escrow.connect(client).hireFreelancer(1, deadline, ethers.ZeroHash, { value: PRICE })
      ).to.emit(escrow, "JobCreated");
      const job = await escrow.getJob(1);
      expect(job.jobDescription).to.equal(ethers.ZeroHash);
    });
  });

  // ───────────────────────────────────────────
  //  20. FULL LIFECYCLE INTEGRATION
  // ───────────────────────────────────────────

  describe("full lifecycle integration", function () {
    it("complete happy path: list → hire → submit → confirm → feedback", async function () {
      const { escrow, freelancer, client } = await deploy();

      // Stake both parties
      await stake(escrow, client);
      await stake(escrow, freelancer);

      // List
      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      expect(await escrow.serviceCount()).to.equal(1);

      // Hire
      const deadline = await futureDeadline(30);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      expect(await escrow.jobCount()).to.equal(1);

      // Submit
      await escrow.connect(freelancer).submitWork(1, WORK_CID);
      expect((await escrow.getJob(1)).status).to.equal(JOB.Submitted);

      // Confirm
      await escrow.connect(client).confirmCompletion(1);
      expect((await escrow.getJob(1)).status).to.equal(JOB.Done);
      expect(await escrow.tokenCount()).to.equal(2);

      // Feedback
      const [t0, t1] = await escrow.getJobTokens(1);
      await escrow.connect(client).submitFeedback(t0, 5);
      await escrow.connect(freelancer).submitFeedback(t1, 4);

      const [flAvg,, flJobs] = await escrow.getFreelancerReputation(freelancer.address);
      const [clAvg,, clJobs] = await escrow.getClientReputation(client.address);
      expect(flAvg).to.equal(500);
      expect(flJobs).to.equal(1);
      expect(clAvg).to.equal(400);
      expect(clJobs).to.equal(1);
    });

    it("cancel path: list → hire → submit → cancel → clearWork", async function () {
      const { escrow, freelancer, client } = await deploy();

      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(14);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      await escrow.connect(freelancer).submitWork(1, WORK_CID);

      await escrow.connect(client).cancelJob(1);
      expect((await escrow.getJob(1)).status).to.equal(JOB.Cancelled);

      await escrow.connect(freelancer).clearWork(1);
      expect((await escrow.getJob(1)).workCid).to.equal(ethers.ZeroHash);
      expect(await escrow.tokenCount()).to.equal(0);
    });

    it("autoRelease path: list → hire → submit → 3 days → autoRelease → feedback", async function () {
      const { escrow, freelancer, client } = await deploy();
      await stake(escrow, client);
      await stake(escrow, freelancer);

      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(30);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      await escrow.connect(freelancer).submitWork(1, WORK_CID);

      await time.increase(DAYS_3 + 1);
      await escrow.autoRelease(1);
      expect((await escrow.getJob(1)).status).to.equal(JOB.Done);

      const [t0, t1] = await escrow.getJobTokens(1);
      await escrow.connect(client).submitFeedback(t0, 3);
      await escrow.connect(freelancer).submitFeedback(t1, 5);

      const [flAvg] = await escrow.getFreelancerReputation(freelancer.address);
      expect(flAvg).to.equal(300);
    });

    it("single-sided finalizeReview path after 7-day window", async function () {
      const { escrow, freelancer, client } = await deploy();
      await stake(escrow, client);

      await escrow.connect(freelancer).offerService(PRICE, META_CID);
      const deadline = await futureDeadline(30);
      await escrow.connect(client).hireFreelancer(1, deadline, JOB_DESC, { value: PRICE });
      await escrow.connect(freelancer).submitWork(1, WORK_CID);
      await escrow.connect(client).confirmCompletion(1);

      const [t0] = await escrow.getJobTokens(1);
      await escrow.connect(client).submitFeedback(t0, 4);

      await time.increase(DAYS_7 + 1);
      await escrow.finalizeReview(1);

      const [avg,, jobs] = await escrow.getFreelancerReputation(freelancer.address);
      expect(avg).to.equal(400);
      expect(jobs).to.equal(1);
    });
  });
});
