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
import { computeCid, cidToBytes32, uploadFileToIPFS } from "../../utils/ipfs";
import { fmtEth, timeLeft, isZeroCid } from "../../utils/helpers";

const MIN_STAKE = ethers.parseEther("0.05");

const FreelancerJobs = ({ account, signer, provider, toast }) => {
  const [mode, setMode] = useState('jobs'); // 'jobs' or 'rate'
  const [rateMode, setRateMode] = useState('submit'); // 'submit' or 'finalize' when mode='rate'
  const [jobs, setJobs] = useState([]);
  const [rateJobs, setRateJobs] = useState([]);
  const [revealJobs, setRevealJobs] = useState([]);
  const [clientReps, setClientReps] = useState({}); // client address -> {avg, total}
  const [busy, setBusy] = useState(false);
  const [submitJob, setSubmitJob] = useState(null); // jobId | null
  const [rateJob, setRateJob] = useState(null); // jobId | null
  const [clientRepModal, setClientRepModal] = useState(null); // client address | null
  const [workDesc, setWorkDesc] = useState("");
  const [workFile, setWorkFile] = useState(null);
  const [workCid, setWorkCid] = useState("");
  const [score, setScore] = useState(0);
  const [userStake, setUserStake] = useState(0n);
  const [cidModal, setCidModal] = useState(null); // job object | null

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

      let stake = 0n;
      try {
        stake = await c.stakes(account);
      } catch (e) {
        console.warn("Error fetching stakes:", e.message);
        // Default to 0 if stakes call fails
      }
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
              const [avgScoreScaled, totalWeight, totalJobs] = await c.getClientReputation(j.client);
              reps[j.client] = { avg: Number(avgScoreScaled), weight: Number(totalWeight), jobs: Number(totalJobs) };
            } catch (e) {
              console.warn("Failed to fetch client reputation for", j.client, e);
              reps[j.client] = { avg: 0, weight: 0, jobs: 0 };
            }
          }
          
          let realCID = null;
          let workSubmission = null;
          if (j.workCid && j.workCid !== ZERO_CID) {
            try {
              const res = await fetch(`http://localhost:3000/get-cid/${j.workCid}`);
              if (res.ok) {
                const data = await res.json();
                realCID = data.cid;
              }
              
              // Also fetch work submission details
              try {
                const subRes = await fetch(`http://localhost:3000/get-work-submission/${i}`);
                if (subRes.ok) {
                  workSubmission = await subRes.json();
                }
              } catch (subError) {
                console.warn("Could not fetch work submission:", subError);
              }
            } catch (e) {
              console.warn("CID not found", e);
            }
          }
          list.push({
            id: i,
            client: j.client,
            serviceId: Number(j.serviceId),
            status: Number(j.status),
            amount: j.amount.toString(),
            deadline: Number(j.deadline),
            submittedAt: Number(j.submittedAt),
            workCid: j.workCid,
            realCID: realCID,
            workSubmission: workSubmission
          });
        }
        setJobs(list);
        setClientReps(reps);
      } else if (mode === 'rate') {
        const cnt = Number(await c.jobCount());
        const submitList = [];
        const finalizeList = [];

        for (let i = 1; i <= cnt; i++) {
          const j = await c.getJob(i);
          const sv = await c.getService(Number(j.serviceId));
          
          // Only show jobs where this freelancer is involved and job is completed
          if (sv.freelancer.toLowerCase() !== account.toLowerCase() || Number(j.status) !== 2) {
            continue;
          }

          // Get freelancer's feedback token (index 1)
          const [clientTokenId, freelancerTokenId] = await c.getJobTokens(i);
          if (Number(freelancerTokenId) === 0) continue;

          const token = await c.tokens(Number(freelancerTokenId));

          const jobData = {
            id: i,
            client: j.client,
            amount: j.amount.toString(),
            tokenId: Number(freelancerTokenId),
            token: token
          };

          if (!token.used) {
            // Not yet submitted
            submitList.push(jobData);
          } else if (!token.applied) {
            // Submitted but not applied
            finalizeList.push(jobData);
          }
        }
        setRateJobs(submitList);
        setRevealJobs(finalizeList);
      }
    } catch (e) {
      console.error("loadChain error:", e);
      toast("Failed to load: " + e.message, "error");
    }
  };

  /* ── Submit work ──────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!workFile && !workCid.trim()) {
      toast("Upload a file or paste a CID", "error");
      return;
    }

    setBusy(true);
    try {
      let originalCid;
      
      if (workCid.trim()) {
        // Use manually provided CID
        originalCid = workCid.trim().replace("ipfs://", "");
      } else if (workFile) {
        // Upload file to IPFS via Pinata
        toast("Uploading file to IPFS…");
        originalCid = await uploadFileToIPFS(workFile);
      }
      
      const cidHash = cidToBytes32(originalCid);

      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      // Submit to blockchain first
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.submitWork(submitJob, cidHash);
      toast("Submitting on-chain…");
      await tx.wait();

      // Then store in backend
      try {
        const backendResponse = await fetch("http://localhost:3000/store-work-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: submitJob,
            freelancer: account,
            cidHash: cidHash,
            originalCid: originalCid,
            workDescription: workDesc.trim(),
            fileName: workFile ? workFile.name : null
          })
        });

        const backendData = await backendResponse.json();

        if (!backendResponse.ok) {
          throw new Error(backendData.error || "Backend failed");
        } else {
          console.log("Work stored in backend:", backendData);
        }
      } catch (backendError) {
        console.warn("Backend communication failed:", backendError);
        // Continue with success even if backend fails
      }

      toast("Work submitted — hash locked on-chain.", "success");
      await loadChain();
      setSubmitJob(null);
      setWorkDesc("");
      setWorkFile(null);
      setWorkCid("");

    } catch (e) {
      console.error("Work submission error:", e);
      toast(e.reason ?? e.message ?? "Failed to submit work", "error");
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
  const handleSubmitFeedback = async () => {
    if (!score) { 
      toast("Select a star rating", "error"); 
      return; 
    }
    if (userStake < MIN_STAKE) {
      toast("Insufficient stake. Deposit at least 0.05 ETH", "error");
      return;
    }
    setBusy(true);
    try {
      if (!rateJob) {
        toast("No job selected", "error");
        setBusy(false);
        return;
      }

      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tokens = await c.getJobTokens(rateJob.id);
      const tokenId = tokens[1]; // freelancer token

      const tx = await c.submitFeedback(tokenId, score);
      toast("Submitting rating…");
      await tx.wait();

      toast("Rating submitted!", "success");
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
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.finalizeReview(jobId);
      toast("Finalizing rating…");
      await tx.wait();
      toast("Rating finalized!", "success");
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
            { label: 'Submit Rating', value: 'submit' },
            { label: 'Finalize Rating', value: 'finalize' },
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
      ) : mode === 'rate' && (rateMode === 'submit' ? rateJobs : revealJobs).length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>{rateMode === 'submit' ? 'No jobs to rate yet.' : 'No pending ratings to finalize.'} ✓</p>
          </div>
        </Card>
      ) : (
        <div className="fjobs-list">
          {(mode === 'jobs' ? jobs : (rateMode === 'submit' ? rateJobs : revealJobs)).map((job) => {
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
                        Client Reputation {clientReps[job.client].jobs > 0 ? `(${clientReps[job.client].jobs} rating${clientReps[job.client].jobs !== 1 ? 's' : ''})` : '(No ratings yet)'}
                      </button>
                    </div>
                  )}

                  {/* Work status */}
                  {hasWork && (
                    <div className={`fjob-card__work fjob-card__work--${job.status === 2 ? "locked" : "submitted"}`}>
                      <span>
                        {job.status === 2 ? "🔒 Work locked on-chain" : "✓ Work submitted"}
                      </span>
                      <span className="fjob-card__work-cid">
                        <button 
                          className="fjob-card__cid-btn"
                          onClick={() => setCidModal(job)}
                        >
                          View Work
                        </button>
                      </span>
                      {job.status === 2 && (
                        <div className="fjob-card__backend-note">
                          📄 Work description stored securely in backend
                        </div>
                      )}
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
                  {rateMode === 'submit' ? (
                    <Btn accent="#10b981" onClick={() => setRateJob(job)}>
                      Submit Rating ★
                    </Btn>
                  ) : (
                    <Btn accent="#10b981" onClick={() => handleFinalizeReview(job.id)} loading={busy}>
                      Finalize Rating
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
        onClose={() => { setSubmitJob(null); setWorkDesc(""); setWorkFile(null); setWorkCid(""); }}
        title={`Submit Work · Job #${submitJob}`}
        accent="#f59e0b"
      >
        <Textarea
          label="Work description (optional)"
          value={workDesc}
          onChange={setWorkDesc}
          placeholder="Describe what you delivered (optional notes)"
          rows={3}
        />
        <div style={{ marginTop: '1rem', padding: '1rem', border: '2px solid #f59e0b', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
          <p style={{ margin: '0 0 1rem 0', fontWeight: 'bold', color: '#f59e0b' }}>
            ✓ REQUIRED: Upload file OR paste CID
          </p>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Upload Work File
            </label>
            <input
              type="file"
              onChange={(e) => setWorkFile(e.target.files[0])}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {workFile && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#10b981' }}>
                ✓ Selected: {workFile.name}
              </p>
            )}
          </div>

          <div style={{ textAlign: 'center', margin: '1rem 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#666' }}>
            OR
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Paste IPFS CID
            </label>
            <input
              type="text"
              placeholder="Qm... or ipfs://Qm..."
              value={workCid}
              onChange={(e) => setWorkCid(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            {workCid && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#10b981' }}>
                ✓ CID provided: {workCid.slice(0, 30)}...
              </p>
            )}
          </div>
        </div>
        
        <InfoBox color="#38bdf8" style={{ marginTop: '1rem' }}>
          🔒 Work will be hashed on-chain. Once client confirms, the hash is <strong>permanently locked</strong> as proof of delivery.
        </InfoBox>
        <div className="modal__footer">
          <Btn variant="ghost" onClick={() => { setSubmitJob(null); setWorkDesc(""); setWorkFile(null); setWorkCid(""); }}>
            Cancel
          </Btn>
          <Btn onClick={handleSubmit} loading={busy} accent="#f59e0b" disabled={!workFile && !workCid.trim()}>
            Submit On-Chain
          </Btn>
        </div>
      </Modal>

      {/* Submit rating modal */}
      {mode === 'rate' && rateMode === 'submit' && (
        <Modal
          open={!!rateJob}
          onClose={() => { setRateJob(null); setScore(0); }}
          title={`Submit Rating · Job #${rateJob?.id ?? ''}`}
          accent="#10b981"
        >
          <div className="rate-modal__stars-wrap">
            <p className="rate-modal__prompt">
              How was the client? (1-5 stars)
            </p>
            <Stars value={score} onChange={setScore} />
            <p className="rate-modal__note">
              Your rating will be submitted to the blockchain and applied after 7 days or when the client also rates you.
            </p>
          </div>
          <div className="modal__footer">
            <Btn variant="ghost" onClick={() => { setRateJob(null); setScore(0); }}>
              Cancel
            </Btn>
            <Btn onClick={handleSubmitFeedback} loading={busy} accent="#10b981">
              Submit Rating
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

      {/* Work CID Modal - shows both on-chain hash and original IPFS CID */}
      <Modal
        open={!!cidModal}
        onClose={() => setCidModal(null)}
        title="Work Submission Details"
        accent="#38bdf8"
      >
        {cidModal && (
          <div>
            {/* On-chain hash (for verification) */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                On-Chain Hash (Verification):
              </h4>
              <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                {cidModal.workCid}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                This hash is permanently stored on-chain as proof of work submission.
              </p>
            </div>

            {/* Original IPFS CID (if available from backend) */}
            {cidModal.workSubmission?.originalCid && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  IPFS Content Hash:
                </h4>
                <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  {cidModal.workSubmission.originalCid}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  ipfs://{cidModal.workSubmission.originalCid}
                </p>
                <a 
                  href={`https://gateway.pinata.cloud/ipfs/${cidModal.workSubmission.originalCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.5rem', color: '#38bdf8', textDecoration: 'none', fontWeight: 'bold' }}
                >
                  → View on Pinata Gateway
                </a>
              </div>
            )}

            {/* Work description */}
            {cidModal.workSubmission?.workDescription && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  Work Description:
                </h4>
                <p style={{ background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {cidModal.workSubmission.workDescription}
                </p>
              </div>
            )}

            {/* File name */}
            {cidModal.workSubmission?.fileName && (
              <div>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                  File Name:
                </h4>
                <p style={{ background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  {cidModal.workSubmission.fileName}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FreelancerJobs;
