import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Browse.css";

import { Btn, Card, InfoBox, Chip, Stars } from "../../components/ui";
import Modal from "../../components/Modal";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";
import { loadMeta } from "../../utils/ipfs";
import { fmtEth } from "../../utils/helpers";

const Browse = ({ account, signer, provider, toast, onHired }) => {
  const [services,    setServices]   = useState([]);
  const [hireTarget,  setHireTarget] = useState(null);
  const [freelancerReps, setFreelancerReps] = useState({}); // freelancer address -> {avg, total}
  const [freelancerRepModal, setFreelancerRepModal] = useState(null); // freelancer address | null
  const [busy,        setBusy]       = useState(false);

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
      const c   = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      const cnt = Number(await c.serviceCount());
      const list = [];
      const reps = {};
      for (let i = 1; i <= cnt; i++) {
        const s = await c.getService(i);
        const m = loadMeta(s.metadataCid) ?? {};
        
        // Fetch freelancer reputation if not already cached
        if (!reps[s.freelancer]) {
          try {
            const [avg, total] = await c.getFreelancerReputation(s.freelancer);
            reps[s.freelancer] = { avg: Number(avg), total: Number(total) };
          } catch (e) {
            console.warn("Failed to fetch freelancer reputation for", s.freelancer, e);
            reps[s.freelancer] = { avg: 0, total: 0 };
          }
        }
        
        list.push({
          id:          i,
          freelancer:  s.freelancer,
          status:      Number(s.status),
          priceWei:    s.priceWei.toString(),
          metadataCid: s.metadataCid,
          title:       m.title       ?? "Untitled",
          description: m.description ?? "",
        });
      }
      setServices(list);
      setFreelancerReps(reps);
    } catch (e) {
      toast("Failed to load services: " + e.message, "error");
    }
  };

  /* ── Hire ─────────────────────────────────────────────────────────── */
  const handleHire = async () => {
    if (!hireTarget) return;
    if (hireTarget.freelancer.toLowerCase() === account?.toLowerCase()) {
      toast("Cannot hire yourself", "error");
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
      const tx = await c.hireFreelancer(hireTarget.id, {
        value: hireTarget.priceWei,
      });
      toast("Payment locked in escrow…");
      await tx.wait();
      toast("Hired! Payment locked in escrow.", "success");
      await loadChain();
      onHired?.();
      setHireTarget(null);
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed", "error");
    }
    setBusy(false);
  };

  const listed = services.filter((s) => s.status === 0);

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      <h2 className="section-heading">Browse Services</h2>

      {listed.length === 0 ? (
        <Card>
          <div className="empty-state">
            <p>No available services right now.</p>
          </div>
        </Card>
      ) : (
        <div className="browse-grid">
          {listed.map((svc) => (
            <Card key={svc.id} className="browse-card">
              <div className="browse-card__top">
                <span className="browse-card__id">#{svc.id}</span>
                <Chip addr={svc.freelancer} />
              </div>
              <h3 className="browse-card__title">{svc.title}</h3>
              <p className="browse-card__desc">{svc.description}</p>
              
              {/* Freelancer Reputation */}
              <div className="browse-card__freelancer-rep">
                <button 
                  className="browse-card__freelancer-rep-btn"
                  onClick={() => setFreelancerRepModal(svc.freelancer)}
                >
                  Freelancer Reputation
                </button>
              </div>
              
              <div className="browse-card__footer">
                <span className="browse-card__price">
                  {fmtEth(svc.priceWei)}
                </span>
                <Btn
                  sm
                  accent="#38bdf8"
                  onClick={() => setHireTarget(svc)}
                  disabled={svc.freelancer.toLowerCase() === account?.toLowerCase()}
                >
                  {svc.freelancer.toLowerCase() === account?.toLowerCase()
                    ? "Your Service"
                    : "Hire Now"}
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Hire confirmation modal */}
      <Modal
        open={!!hireTarget}
        onClose={() => setHireTarget(null)}
        title="Confirm Hire"
        accent="#38bdf8"
      >
        {hireTarget && (
          <>
            <div className="hire-modal__preview">
              <h3 className="hire-modal__preview-title">{hireTarget.title}</h3>
              <p className="hire-modal__preview-desc">{hireTarget.description}</p>
              <div className="hire-modal__preview-meta">
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  Freelancer <Chip addr={hireTarget.freelancer} />
                </span>
                <span className="hire-modal__preview-price">
                  {fmtEth(hireTarget.priceWei)}
                </span>
              </div>
            </div>

            <InfoBox color="#38bdf8">
              ⛓ {fmtEth(hireTarget.priceWei)} will be locked in the smart contract
              escrow until you confirm the work is complete.
            </InfoBox>

            <div className="modal__footer">
              <Btn variant="ghost" onClick={() => setHireTarget(null)}>
                Cancel
              </Btn>
              <Btn onClick={handleHire} loading={busy} accent="#38bdf8">
                Pay &amp; Hire
              </Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Freelancer Reputation Modal */}
      <Modal
        open={!!freelancerRepModal}
        onClose={() => setFreelancerRepModal(null)}
        title="Freelancer Reputation"
        accent="#10b981"
      >
        {freelancerRepModal && freelancerReps[freelancerRepModal] && (
          <div className="freelancer-rep-modal">
            <div className="freelancer-rep-modal__address">
              <Chip addr={freelancerRepModal} />
            </div>
            <div className="freelancer-rep-modal__score">
              <div className="freelancer-rep-modal__score-value">
                {(freelancerReps[freelancerRepModal].avg / 100).toFixed(1)}/5
              </div>
              <div className="freelancer-rep-modal__stars">
                <Stars value={Math.round(freelancerReps[freelancerRepModal].avg / 100)} readonly />
              </div>
            </div>
            <div className="freelancer-rep-modal__stats">
              <div className="freelancer-rep-modal__stat">
                <span className="freelancer-rep-modal__stat-label">Total Ratings:</span>
                <span className="freelancer-rep-modal__stat-value">{freelancerReps[freelancerRepModal].total}</span>
              </div>
            </div>
          </div>
        )}
        <div className="modal__footer">
          <Btn onClick={() => setFreelancerRepModal(null)}>
            Close
          </Btn>
        </div>
      </Modal>
    </div>
  );
};

export default Browse;
