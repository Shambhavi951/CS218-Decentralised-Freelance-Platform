import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Rate.css";

import { Btn, Card, Stars, Chip, Tabs, InfoBox } from "../../components/ui";
import Modal from "../../components/Modal";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";
import { loadMeta } from "../../utils/ipfs";
import { fmtEth } from "../../utils/helpers";

const MIN_STAKE = ethers.parseEther("0.05");

const Rate = ({ account, signer, provider, toast }) => {
  const [mode, setMode] = useState('commit'); // 'commit' or 'reveal'
  const [jobs, setJobs] = useState([]);
  const [revealJobs, setRevealJobs] = useState([]);
  const [rateJob, setRateJob] = useState(null);
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [userStake, setUserStake] = useState(0n);

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account, mode]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
      // Debug: Check if ABI is loaded correctly
      console.log("ABI imported:", ABI);
      console.log("ABI length:", ABI?.length);
      console.log("ABI type:", typeof ABI);
      
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      
      // Debug: Log contract instance details
      console.log("Contract Address:", CONTRACT_ADDRESS);
      console.log("Provider:", provider ? "Connected" : "Not connected");
      console.log("Signer:", signer ? "Connected" : "Not connected");
      console.log("Contract instance methods:", Object.keys(c).filter(k => typeof c[k] === 'function').slice(0, 20));
      
      // Check if stakes method exists
      if (typeof c.stakes !== 'function') {
        console.error("stakes is not a function. Available methods:", Object.keys(c).filter(k => k.includes('stake')));
        throw new Error("Contract method 'stakes' not found. Make sure the contract is deployed correctly.");
      }

      const svcCnt = Number(await c.serviceCount());
      const jobCnt = Number(await c.jobCount());
      const stake = await c.stakes(account);
      setUserStake(stake);

      const svcMap = {};
      for (let i = 1; i <= svcCnt; i++) {
        const s = await c.getService(i);
        const m = loadMeta(s.metadataCid) ?? {};
        svcMap[i] = { title: m.title ?? "Untitled", freelancer: s.freelancer };
      }

      if (mode === 'commit') {
        const list = [];
        for (let i = 1; i <= jobCnt; i++) {
          const j = await c.getJob(i);
          if (
            j.client.toLowerCase() !== account.toLowerCase() ||
            Number(j.status) !== 2 ||
            j.clientRated
          ) continue;
          const svc = svcMap[Number(j.serviceId)] ?? {};
          list.push({
            id: i,
            amount: j.amount.toString(),
            title: svc.title ?? "Untitled",
            freelancer: svc.freelancer ?? "",
          });
        }
        setJobs(list);
      } else {
        const list = [];
        const stored = JSON.parse(localStorage.getItem('ratings') || '{}');
        for (let i = 1; i <= jobCnt; i++) {
          const j = await c.getJob(i);
          if (
            j.client.toLowerCase() !== account.toLowerCase() ||
            Number(j.status) !== 2 ||
            !j.clientRated
          ) continue;

          const tokens = await c.getJobTokens(i);
          const tokenId = tokens[0];
          if (!stored[tokenId.toString()]) continue;

          const svc = svcMap[Number(j.serviceId)] ?? {};
          list.push({
            id: i,
            amount: j.amount.toString(),
            title: svc.title ?? "Untitled",
            freelancer: svc.freelancer ?? "",
          });
        }
        setRevealJobs(list);
      }
    } catch (e) {
      console.error("loadChain error:", e);
      toast("Failed to load jobs: " + e.message, "error");
    }
  };

  /* ── Deposit Stake ────────────────────────────────────────────────── */
  const handleDepositStake = async () => {
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.depositStake({ value: MIN_STAKE });
      toast("Depositing stake…");
      await tx.wait();
      toast("Stake deposited!", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Commit Rating ────────────────────────────────────────────────── */
  const handleCommit = async () => {
    if (!stars) { toast("Select a star rating", "error"); return; }
    if (userStake < MIN_STAKE) {
      toast("Insufficient stake. Deposit at least 0.05 ETH", "error");
      return;
    }
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tokens = await c.getJobTokens(rateJob);
      const tokenId = tokens[0]; // client token

      // Generate random salt
      const salt = ethers.hexlify(ethers.randomBytes(32));

      // Compute hash
      const hash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'string'], [stars, salt]));

      const tx = await c.commitFeedback(tokenId, hash);
      toast("Committing rating…");
      await tx.wait();

      // Store score and salt in localStorage
      const stored = JSON.parse(localStorage.getItem('ratings') || '{}');
      stored[tokenId.toString()] = { score: stars, salt };
      localStorage.setItem('ratings', JSON.stringify(stored));

      toast("Rating committed!", "success");
      await loadChain();
      setRateJob(null);
      setStars(0);
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Reveal Rating ────────────────────────────────────────────────── */
  const handleReveal = async (jobId) => {
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tokens = await c.getJobTokens(jobId);
      const tokenId = tokens[0];

      const stored = JSON.parse(localStorage.getItem('ratings') || '{}');
      const data = stored[tokenId.toString()];
      if (!data) {
        toast("Rating data not found", "error");
        setBusy(false);
        return;
      }

      const tx = await c.revealFeedback(tokenId, data.score, data.salt);
      toast("Revealing rating…");
      await tx.wait();

      // Remove from localStorage
      delete stored[tokenId.toString()];
      localStorage.setItem('ratings', JSON.stringify(stored));

      toast("Rating revealed!", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  const currentJobs = mode === 'commit' ? jobs : revealJobs;

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
