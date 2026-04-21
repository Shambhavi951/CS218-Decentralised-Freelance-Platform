// import { uploadFileToIPFS, cidToBytes32 } from "../../utils/ipfs";

// export default function Jobs({ contract, jobs, reload }) {
//   const submit = async (jobId, file) => {
//     const cid = await uploadFileToIPFS(file);
//     const hash = cidToBytes32(cid);

//     await (await contract.submitWork(jobId, hash)).wait();
//     reload();
//   };

//   return <div>Jobs UI here</div>;
// }



import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/freelancer/Jobs.css";

import { Btn, Card, Textarea, InfoBox, Chip, Stars, Tabs } from "../../components/ui";
import Modal       from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS, NOW, ZERO_CID } from "../../constants/config";
import { computeCid } from "../../utils/ipfs";
import { fmtEth, timeLeft, isZeroCid } from "../../utils/helpers";

const MIN_STAKE = ethers.parseEther("0.05");

const FreelancerJobs = ({ account, signer, provider, toast }) => {
  const [mode, setMode] = useState('jobs'); // 'jobs' or 'rate'
  const [rateMode, setRateMode] = useState('commit'); // 'commit' or 'reveal' when mode='rate'
  const [jobs, setJobs] = useState([]);
  const [rateJobs, setRateJobs] = useState([]);
  const [revealJobs, setRevealJobs] = useState([]);
  const [clientReps, setClientReps] = useState({}); // client address -> {avg, total}
  const [busy, setBusy] = useState(false);
  const [submitJob, setSubmitJob] = useState(null); // jobId | null
  const [rateJob, setRateJob] = useState(null); // jobId | null
  const [clientRepModal, setClientRepModal] = useState(null); // client address | null
  const [workDesc, setWorkDesc] = useState("");
  const [stars, setStars] = useState(0);
  const [userStake, setUserStake] = useState(0n);

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account, mode, rateMode]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
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

      const stake = await c.stakes(account);
      setUserStake(stake);

      if (mode === 'jobs') {
        const cnt = Number(await c.jobCount());
        const list = [];
        const reps = {};
        for (let i = 1; i <= cnt; i++) {
          const j = await c.getJob(i);
          const sv = await c.getService(Number(j.serviceId));
          if (sv.freelancer.toLowerCase() !== account.toLowerCase()) continue;
          
          // Fetch client reputation if not already cached
          if (!reps[j.client]) {
            try {
              const [avg, total] = await c.getClientReputation(j.client);
              reps[j.client] = { avg: Number(avg), total: Number(total) };
            } catch (e) {
              console.warn("Failed to fetch client reputation for", j.client, e);
              reps[j.client] = { avg: 0, total: 0 };
            }
          }
          
          list.push({
            id: i,
            client: j.client,
            serviceId: Number(j.serviceId),
            status: Number(j.status),
            clientRated: j.clientRated,
            freelancerRated: j.freelancerRated,
            amount: j.amount.toString(),
            deadline: Number(j.deadline),
            submittedAt: Number(j.submittedAt),
            workCid: j.workCid,
          });
        }
        setJobs(list);
        setClientReps(reps);
      } else if (mode === 'rate') {
        const cnt = Number(await c.jobCount());
        if (rateMode === 'commit') {
          const list = [];
          for (let i = 1; i <= cnt; i++) {
            const j = await c.getJob(i);
            const sv = await c.getService(Number(j.serviceId));
            if (
              sv.freelancer.toLowerCase() !== account.toLowerCase() ||
              Number(j.status) !== 2 ||
              j.freelancerRated
            ) continue;
            list.push({
              id: i,
              client: j.client,
              amount: j.amount.toString(),
            });
          }
          setRateJobs(list);
        } else {
          const list = [];
          const stored = JSON.parse(localStorage.getItem('ratings') || '{}');
          for (let i = 1; i <= cnt; i++) {
            const j = await c.getJob(i);
            const sv = await c.getService(Number(j.serviceId));
            if (
              sv.freelancer.toLowerCase() !== account.toLowerCase() ||
              Number(j.status) !== 2 ||
              !j.freelancerRated
            ) continue;

            const tokens = await c.getJobTokens(i);
            const tokenId = tokens[1];
            if (!stored[tokenId.toString()]) continue;

            list.push({
              id: i,
              client: j.client,
              amount: j.amount.toString(),
            });
          }
          setRevealJobs(list);
        }
      }
    } catch (e) {
      console.error("loadChain error:", e);
      toast("Failed to load: " + e.message, "error");
    }
  };

  /* ── Submit work ──────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!workDesc.trim()) { toast("Describe your work first", "error"); return; }
    setBusy(true);
    try {
      const cid = await computeCid(workDesc);
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.submitWork(submitJob, cid);
      toast("Submitting on-chain…");
      await tx.wait();
      toast("Work submitted — hash locked on-chain.", "success");
      await loadChain();
      setSubmitJob(null);
      setWorkDesc("");
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Auto-release ─────────────────────────────────────────────────── */
  const handleAutoRelease = async (jobId, submittedAt) => {
    const now = Math.floor(Date.now() / 1000);
    const releaseReadyAt = submittedAt + 3 * 86400;
    if (now < releaseReadyAt) {
      const timeLeftSeconds = releaseReadyAt - now;
      const days = Math.floor(timeLeftSeconds / 86400);
      const hours = Math.floor((timeLeftSeconds % 86400) / 3600);
      toast(
        `Too early to auto-release. Wait ${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}.`,
        "warning"
      );
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

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.autoRelease(jobId);
      toast("Releasing payment…");
      await tx.wait();
      toast("Payment released!", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Clear work ───────────────────────────────────────────────────── */
  const handleClearWork = async (jobId) => {
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.clearWork(jobId);
      toast("Clearing work CID…");
      await tx.wait();
      toast("Cleared. Unpin from IPFS now.", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
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
      const tokenId = tokens[1]; // freelancer token

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
      const tokenId = tokens[1];

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

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      <h2 className="section-heading">Freelancer Dashboard</h2>

      <Tabs
        tabs={[
          { label: 'My Jobs', value: 'jobs' },
          { label: 'Rate Clients', value: 'rate' },
        ]}
        active={mode}
        onChange={setMode}
      />

      {mode === 'rate' && userStake < MIN_STAKE && (
        <Card>
          <InfoBox type="warning">
            You need at least 0.05 ETH stake to commit ratings.
            <Btn onClick={handleDepositStake} loading={busy} style={{ marginLeft: '10px' }}>
              Deposit Stake
            </Btn>
          </InfoBox>
        </Card>
      )}

      {mode === 'rate' && (
        <Tabs
          tabs={[
            { label: 'Commit Rating', value: 'commit' },
            { label: 'Reveal Rating', value: 'reveal' },
          ]}
          active={rateMode}
          onChange={setRateMode}
        />
      )}

      {mode === 'jobs' && jobs.length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>No jobs assigned yet.</p>
          </div>
        </Card>
      ) : mode === 'rate' && (rateMode === 'commit' ? rateJobs : revealJobs).length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>{rateMode === 'commit' ? 'No jobs to commit rating.' : 'No ratings to reveal.'} ✓</p>
          </div>
        </Card>
      ) : (
        <div className="fjobs-list">
          {(mode === 'jobs' ? jobs : (rateMode === 'commit' ? rateJobs : revealJobs)).map((job) => {
            if (mode === 'jobs') {
            const hasWork = !isZeroCid(job.workCid);
            const accentColor = ["#4ade80","#fb923c","#38bdf8","#f87171"][job.status];

            return (
              <Card key={job.id} className="fjob-card" style={{ borderLeftColor: accentColor }}>
                {/* Body */}
                <div className="fjob-card__body">
                  <div className="fjob-card__meta">
                    <span className="fjob-card__id">Job #{job.id}</span>
                    <StatusBadge kind="job" status={job.status} />
                    <span className="fjob-card__svc-id">Service #{job.serviceId}</span>
                  </div>

                  <div className="fjob-card__grid">
                    <div>Client <Chip addr={job.client} /></div>
                    <div>Escrow <b>{fmtEth(job.amount)}</b></div>
                    {job.status === 0 && (
                      <div>
                        Deadline{" "}
                        <b className={NOW > job.deadline ? "fjob-card__deadline--expired" : ""}>
                          {timeLeft(job.deadline)}
                        </b>
                      </div>
                    )}
                    {job.status === 1 && (
                      <div>
                        Auto-release{" "}
                        <b className="fjob-card__autorelease-time">
                          {timeLeft(job.submittedAt + 3 * 86400)}
                        </b>
                      </div>
                    )}
                  </div>

                  {/* Client Reputation */}
                  {clientReps[job.client] && (
                    <div className="fjob-card__client-rep">
                      <button 
                        className="fjob-card__client-rep-btn"
                        onClick={() => setClientRepModal(job.client)}
                      >
                        Client Reputation {clientReps[job.client].total > 0 ? `(${clientReps[job.client].total} rating${clientReps[job.client].total !== 1 ? 's' : ''})` : '(No ratings yet)'}
                      </button>
                    </div>
                  )}

                  {/* Work status */}
                  {hasWork && (
                    <div className={`fjob-card__work fjob-card__work--${job.status === 2 ? "locked" : "submitted"}`}>
                      <span>
                        {job.status === 2 ? "🔒 Work locked on-chain" : "✓ Work submitted"}
                      </span>
                      <span className="fjob-card__work-cid">{job.workCid.slice(0, 36)}…</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="fjob-card__actions">
                  {job.status === 0 && (
                    <Btn sm accent="#f59e0b" onClick={() => setSubmitJob(job.id)}>
                      Submit Work
                    </Btn>
                  )}
                  {job.status === 1 && (
                    <Btn sm variant="outline" accent="#38bdf8"
                      onClick={() => handleAutoRelease(job.id, job.submittedAt)} loading={busy}>
                      Auto-Release
                    </Btn>
                  )}
                  {job.status === 3 && hasWork && (
                    <Btn sm variant="danger"
                      onClick={() => handleClearWork(job.id)} loading={busy}>
                      Clear Work
                    </Btn>
                  )}
                </div>
              </Card>
            );
            } else {
              // Rate mode
              return (
                <Card key={job.id} className="rate-card">
                  <div className="rate-card__info">
                    <div className="rate-card__meta">
                      <span className="rate-card__id">Job #{job.id}</span>
                    </div>
                    <p className="rate-card__sub">
                      Paid <b>{fmtEth(job.amount)}</b>
                      &nbsp;·&nbsp; Client <Chip addr={job.client} />
                    </p>
                  </div>
                  {rateMode === 'commit' ? (
                    <Btn accent="#10b981" onClick={() => setRateJob(job.id)}>
                      Commit Rating ★
                    </Btn>
                  ) : (
                    <Btn accent="#10b981" onClick={() => handleReveal(job.id)} loading={busy}>
                      Reveal Rating
                    </Btn>
                  )}
                </Card>
              );
            }
          })}
        </div>
      )}

      {/* Submit work modal */}
      <Modal
        open={!!submitJob}
        onClose={() => { setSubmitJob(null); setWorkDesc(""); }}
        title={`Submit Work · Job #${submitJob}`}
        accent="#f59e0b"
      >
        <Textarea
          label="Work description / IPFS CID"
          value={workDesc}
          onChange={setWorkDesc}
          placeholder="Describe what you delivered, or paste your IPFS CID: ipfs://Qm…"
          rows={4}
        />
        <InfoBox color="#38bdf8">
          🔒 Your work will be hashed on-chain. Once the client confirms, the hash
          is <strong>permanently locked</strong> as proof of delivery.
        </InfoBox>
        <div className="modal__footer">
          <Btn variant="ghost" onClick={() => { setSubmitJob(null); setWorkDesc(""); }}>
            Cancel
          </Btn>
          <Btn onClick={handleSubmit} loading={busy} accent="#f59e0b">
            Submit On-Chain
          </Btn>
        </div>
      </Modal>

      {/* Commit rating modal */}
      {mode === 'rate' && rateMode === 'commit' && (
        <Modal
          open={!!rateJob}
          onClose={() => { setRateJob(null); setStars(0); }}
          title={`Commit Rating · Job #${rateJob}`}
          accent="#10b981"
        >
          <div className="rate-modal__stars-wrap">
            <p className="rate-modal__prompt">
              How was the client? (1-5 stars)
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
            <Btn onClick={handleCommit} loading={busy} accent="#10b981">
              Commit Rating
            </Btn>
          </div>
        </Modal>
      )}

      {/* Client Reputation Modal */}
      <Modal
        open={!!clientRepModal}
        onClose={() => setClientRepModal(null)}
        title="Client Reputation"
        accent="#fbbf24"
      >
        {clientRepModal && clientReps[clientRepModal] && (
          <div className="client-rep-modal">
            <div className="client-rep-modal__address">
              <Chip addr={clientRepModal} />
            </div>
            <div className="client-rep-modal__score">
              <div className="client-rep-modal__score-value">
                {(clientReps[clientRepModal].avg / 100).toFixed(1)}/5
              </div>
              <div className="client-rep-modal__stars">
                <Stars value={Math.round(clientReps[clientRepModal].avg / 100)} readonly />
              </div>
            </div>
            <div className="client-rep-modal__stats">
              <div className="client-rep-modal__stat">
                <span className="client-rep-modal__stat-label">Total Ratings:</span>
                <span className="client-rep-modal__stat-value">{clientReps[clientRepModal].total}</span>
              </div>
            </div>
            {clientReps[clientRepModal].total === 0 && (
              <p className="client-rep-modal__none">No client reputation yet.</p>
            )}
          </div>
        )}
        <div className="modal__footer">
          <Btn onClick={() => setClientRepModal(null)}>
            Close
          </Btn>
        </div>
      </Modal>
    </div>
  );
};

export default FreelancerJobs;
