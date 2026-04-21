import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Rate.css";

import { Btn, Card, Stars, Chip, Tabs, InfoBox } from "../../components/ui";
import Modal from "../../components/Modal";

import { CONTRACT_ADDRESS, MIN_STAKE } from "../../constants/config";
import { loadMeta } from "../../utils/ipfs";
import { fmtEth } from "../../utils/helpers";
import {
  getFeedbackToken,
  submitFeedback,
  finalizeReview,
  depositStake,
} from "../../utils/contractHelpers";
import { ABI } from "../../constants/abi";

const MIN_STAKE_WEI = ethers.parseEther("0.05");

const Rate = ({ account, signer, provider, toast }) => {
  const [tab, setTab] = useState('pending'); // 'pending' or 'finalize'
  const [pendingJobs, setPendingJobs] = useState([]);
  const [expiredJobs, setExpiredJobs] = useState([]);
  const [rateJob, setRateJob] = useState(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [userStake, setUserStake] = useState(0n);
  const [hasStake, setHasStake] = useState(false);

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account, tab]); // eslint-disable-line

  const loadChain = async () => {
    if (!account || !provider) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

      // Get user stake
      const stake = await contract.stakes(account);
      setUserStake(stake);
      const sufficient = stake >= MIN_STAKE_WEI;
      setHasStake(sufficient);

      // Get service info map
      const svcCnt = Number(await contract.serviceCount());
      const svcMap = {};
      for (let i = 1; i <= svcCnt; i++) {
        const s = await contract.getService(i);
        const m = loadMeta(s.metadataCid) ?? {};
        svcMap[i] = { title: m.title ?? "Untitled", freelancer: s.freelancer };
      }

      // Get jobs where this account is the client
      const jobCnt = Number(await contract.jobCount());
      const pendingList = [];
      const expiredList = [];

      for (let i = 1; i <= jobCnt; i++) {
        const job = await contract.getJob(i);

        // Only show completed jobs
        if (Number(job.status) !== 2) continue; // 2 = Done

        // Only show if current account is the client
        if (job.client.toLowerCase() !== account.toLowerCase()) continue;

        // Get feedback tokens for this job
        const [clientTokenId, freelancerTokenId] = await contract.getJobTokens(i);
        
        // Client rates freelancer (uses clientTokenId)
        if (Number(clientTokenId) === 0) continue;

        const token = await getFeedbackToken(Number(clientTokenId), provider);
        const svc = svcMap[Number(job.serviceId)] ?? {};

        const jobData = {
          jobId: i,
          tokenId: token.tokenId,
          token,
          amount: job.amount.toString(),
          title: svc.title ?? "Untitled",
          freelancer: svc.freelancer ?? "",
          reviewee: job.freelancer || svc.freelancer // Person being rated
        };

        if (token.used) {
          // Already submitted - check if it needs finalization
          if (token.isExpired && !token.applied) {
            expiredList.push(jobData);
          }
        } else {
          // Not yet submitted
          pendingList.push(jobData);
        }
      }

      setPendingJobs(pendingList);
      setExpiredJobs(expiredList);
    } catch (e) {
      console.error("loadChain error:", e);
      toast("Failed to load jobs: " + e.message, "error");
    }
  };

  /* ── Deposit Stake ────────────────────────────────────────────────── */
  const handleDepositStake = async () => {
    setBusy(true);
    try {
      if (!signer) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const tx = await depositStake(MIN_STAKE_WEI, signer);
      toast("Depositing stake…");
      await tx.wait();
      toast("Stake deposited!", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Submit Feedback ──────────────────────────────────────────────── */
  const handleSubmitFeedback = async () => {
    if (!score) {
      toast("Select a star rating", "error");
      return;
    }

    if (!hasStake) {
      toast("Insufficient stake. Deposit at least 0.05 ETH", "error");
      return;
    }

    setBusy(true);
    try {
      if (!signer) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const tx = await submitFeedback(rateJob.tokenId, score, signer);
      toast("Submitting feedback…");
      await tx.wait();
      toast("Feedback submitted!", "success");
      
      await loadChain();
      setRateJob(null);
      setScore(0);
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Finalize Review ──────────────────────────────────────────────── */
  const handleFinalizeReview = async (jobId) => {
    setBusy(true);
    try {
      if (!signer) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const tx = await finalizeReview(jobId, signer);
      toast("Finalizing review…");
      await tx.wait();
      toast("Review finalized!", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      <h2 className="section-heading">Rate &amp; Review</h2>

      <Tabs
        tabs={[
          { label: 'Commit Rating', value: 'commit' },
          { label: 'Reveal Rating', value: 'reveal' },
        ]}
        active={mode}
        onChange={setMode}
      />

      {userStake < MIN_STAKE && (
        <Card>
          <InfoBox type="warning">
            You need at least 0.05 ETH stake to commit ratings.
            <Btn onClick={handleDepositStake} loading={busy} style={{ marginLeft: '10px' }}>
              Deposit Stake
            </Btn>
          </InfoBox>
        </Card>
      )}

      {currentJobs.length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>{mode === 'commit' ? 'No jobs to commit rating.' : 'No ratings to reveal.'} ✓</p>
          </div>
        </Card>
      ) : (
        <div className="rate-list">
          {currentJobs.map((job) => (
            <Card key={job.id} className="rate-card">
              <div className="rate-card__info">
                <div className="rate-card__meta">
                  <span className="rate-card__id">Job #{job.id}</span>
                  <span className="rate-card__title">{job.title}</span>
                </div>
                <p className="rate-card__sub">
                  Paid <b>{fmtEth(job.amount)}</b>
                  &nbsp;·&nbsp; Freelancer <Chip addr={job.freelancer} />
                </p>
              </div>
              {mode === 'commit' ? (
                <Btn accent="#38bdf8" onClick={() => setRateJob(job.id)}>
                  Commit Rating ★
                </Btn>
              ) : (
                <Btn accent="#10b981" onClick={() => handleReveal(job.id)} loading={busy}>
                  Reveal Rating
                </Btn>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Commit modal */}
      {mode === 'commit' && (
        <Modal
          open={!!rateJob}
          onClose={() => { setRateJob(null); setStars(0); }}
          title={`Commit Rating · Job #${rateJob}`}
          accent="#38bdf8"
        >
          <div className="rate-modal__stars-wrap">
            <p className="rate-modal__prompt">
              How was the quality of work delivered? (1-5 stars)
            </p>
            <Stars value={stars} onChange={setStars} />
            <p className="rate-modal__note">
              Your rating will be committed anonymously. You can reveal it later.
            </p>
          </div>
          <div className="modal__footer">
            <Btn variant="ghost" onClick={() => { setRateJob(null); setStars(0); }}>
              Cancel
            </Btn>
            <Btn onClick={handleCommit} loading={busy} accent="#38bdf8">
              Commit Rating
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Rate;
