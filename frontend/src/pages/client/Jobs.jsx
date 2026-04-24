import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Jobs.css";

import { Btn, Card, Chip,InfoBox } from "../../components/ui";
import Modal                from "../../components/Modal";
import StatusBadge          from "../../components/StatusBadge";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS, NOW } from "../../constants/config";
import { loadMeta } from "../../utils/ipfs";
import { fmtEth, timeLeft, isZeroCid } from "../../utils/helpers";

const ClientJobs = ({ account, signer, provider, toast, onRateNeeded }) => {
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [cidModal, setCidModal] = useState(null); // workCid | null

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
      const c      = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      const svcCnt = Number(await c.serviceCount());
      const jobCnt = Number(await c.jobCount());

      // Pre-fetch all services for title + freelancer
      const svcMap = {};
      for (let i = 1; i <= svcCnt; i++) {
        const s = await c.getService(i);
        const m = loadMeta(s.metadataCid) ?? {};
        svcMap[i] = { title: m.title ?? "Untitled", freelancer: s.freelancer };
      }

      const list = [];
      for (let i = 1; i <= jobCnt; i++) {
        const j = await c.getJob(i);
        if (j.client.toLowerCase() !== account.toLowerCase()) continue;
        const svc = svcMap[Number(j.serviceId)] ?? {};
        
        // Check if job is rated (for completed jobs)
        let isRated = false;
        let workSubmission = null;
        if (Number(j.status) === 2) { // Done status
          try {
            const [clientTokenId] = await c.getJobTokens(i);
            if (Number(clientTokenId) > 0) {
              const token = await c.tokens(Number(clientTokenId));
              isRated = token.applied;
            }

            // Try to get work submission from backend
            try {
              const response = await fetch(`http://localhost:3000/get-work-submission/${i}`);
              if (response.ok) {
                workSubmission = await response.json();
              }
            } catch (backendError) {
              console.warn("Could not fetch work submission from backend:", backendError);
            }
          } catch (e) {
            // Token might not exist yet, ignore
          }
        }
        
        list.push({
          id:              i,
          client:          j.client,
          serviceId:       Number(j.serviceId),
          status:          Number(j.status),
          amount:          j.amount.toString(),
          deadline:        Number(j.deadline),
          submittedAt:     Number(j.submittedAt),
          workCid:         j.workCid,
          title:           svc.title      ?? "Untitled",
          freelancer:      svc.freelancer ?? "",
          isRated:         isRated,
          workSubmission:  workSubmission,
        });
      }
      setJobs(list);
    } catch (e) {
      toast("Failed to load jobs: " + e.message, "error");
    }
  };

  /* ── Confirm ──────────────────────────────────────────────────────── */
  const handleConfirm = async (jobId) => {
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.confirmCompletion(jobId);
      toast("Confirming…");
      await tx.wait();
      toast("Work confirmed! Payment released.", "success");
      await loadChain();
      onRateNeeded?.();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Cancel ───────────────────────────────────────────────────────── */
  const handleCancel = async (jobId) => {
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.cancelJob(jobId);
      toast("Cancelling…");
      await tx.wait();
      toast("Cancelled. Refund issued.", "success");
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      <h2 className="section-heading">My Hired Jobs</h2>

      {jobs.length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>No jobs yet. Go browse and hire!</p>
          </div>
        </Card>
      ) : (
        <div className="cjobs-list">
          {jobs.map((job) => {
            const hasWork     = !isZeroCid(job.workCid);
            const accentColor = ["#4ade80","#fb923c","#38bdf8","#f87171"][job.status];

            return (
              <Card key={job.id} className="cjob-card" style={{ borderLeftColor: accentColor }}>
                {/* Body */}
                <div className="cjob-card__body">
                  <div className="cjob-card__meta">
                    <span className="cjob-card__id">Job #{job.id}</span>
                    <StatusBadge kind="job" status={job.status} />
                    <span className="cjob-card__title">{job.title}</span>
                  </div>

                  <div className="cjob-card__grid">
                    <div>Freelancer <Chip addr={job.freelancer} /></div>
                    <div>Escrow <b>{fmtEth(job.amount)}</b></div>
                    {job.status === 0 && (
                      <div>
                        Deadline{" "}
                        <b className={NOW > job.deadline ? "cjob-card__deadline--expired" : ""}>
                          {timeLeft(job.deadline)}
                        </b>
                      </div>
                    )}
                  </div>

                  {/* Work submitted notice */}
                  {job.status === 1 && hasWork && (
                    <div className="cjob-card__work-notice">
                      📦 Work submitted — review and confirm or cancel.
                      <div className="cjob-card__work-cid">
                        <button 
                          className="cjob-card__cid-btn"
                          onClick={() => setCidModal(job.workCid)}
                        >
                          {job.workCid.slice(0, 36)}…
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Work completed notice - show CID and work description */}
                  {job.status === 2 && hasWork && (
                    <div className="cjob-card__work-notice cjob-card__work-notice--completed">
                      ✅ Work completed and locked on-chain.
                      <div className="cjob-card__work-cid">
                        <button 
                          className="cjob-card__cid-btn"
                          onClick={() => setCidModal(job.workCid)}
                        >
                          {job.workCid.slice(0, 36)}…
                        </button>
                      </div>
                      {job.workSubmission && (
                        <div className="cjob-card__work-description">
                          <strong>Work Description:</strong>
                          <p>{job.workSubmission.workDescription}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="cjob-card__actions">
                  {job.status === 1 && (
                    <>
                      <Btn sm variant="success"
                        onClick={() => handleConfirm(job.id)} loading={busy}>
                        ✓ Confirm
                      </Btn>
                      <Btn sm variant="danger"
                        onClick={() => handleCancel(job.id)} loading={busy}>
                        ✗ Cancel
                      </Btn>
                    </>
                  )}
                  {job.status === 0 && (
                    <Btn sm variant="danger"
                      onClick={() => handleCancel(job.id)} loading={busy}>
                      Cancel
                    </Btn>
                  )}
                  {job.status === 2 && (
                    job.isRated ? (
                      <span className="cjob-card__rated">✓ Rated</span>
                    ) : (
                      <Btn sm variant="outline" accent="#38bdf8"
                        onClick={onRateNeeded}>
                        Rate ★
                      </Btn>
                    )
                  )}
                  {job.status === 3 && (
                    <span className="cjob-card__refunded">Refunded</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* CID Modal */}
      <Modal
        open={!!cidModal}
        onClose={() => setCidModal(null)}
        title="Work CID Hash"
        accent="#38bdf8"
      >
        <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '14px', background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          {cidModal}
        </div>
        <InfoBox color="#38bdf8" style={{ marginTop: '12px' }}>
          This is the hashed CID of the work submitted to IPFS. The full content can be accessed using an IPFS gateway.
        </InfoBox>
      </Modal>
    </div>
  );
};

export default ClientJobs;
