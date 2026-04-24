import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Browse.css";

import { Btn, Card, InfoBox, Chip, Stars } from "../../components/ui";
import Modal from "../../components/Modal";
import FreelancerProfile from "../../components/FreelancerProfile";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";
import { loadMeta } from "../../utils/ipfs";
import { fmtEth } from "../../utils/helpers";

const Browse = ({ account, signer, provider, toast, onHired }) => {
  const [services,    setServices]   = useState([]);
  const [hireTarget,  setHireTarget] = useState(null);
  const [freelancerReps, setFreelancerReps] = useState({}); // freelancer address -> {avg, total}
  const [profileModal, setProfileModal] = useState(null); // svc object | null
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
            const [avgScoreScaled, totalWeight, totalJobs] = await c.getFreelancerReputation(s.freelancer);
            reps[s.freelancer] = { avg: Number(avgScoreScaled), weight: Number(totalWeight), jobs: Number(totalJobs) };
          } catch (e) {
            console.warn("Failed to fetch freelancer reputation for", s.freelancer, e);
            reps[s.freelancer] = { avg: 0, weight: 0, jobs: 0 };
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
              
              {/* Freelancer Profile */}
              <div className="browse-card__freelancer-rep">
                <button 
                  className="browse-card__freelancer-rep-btn"
                  onClick={() => setProfileModal(svc)}
                >
                  View Profile
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

      {/* Freelancer Profile Modal */}
      <Modal
        open={!!profileModal}
        onClose={() => setProfileModal(null)}
        title="Freelancer Profile"
        accent="#10b981"
      >
        {profileModal && (
          <FreelancerProfile 
            freelancerId={profileModal.freelancer}
            context="browse"
            reputation={freelancerReps[profileModal.freelancer]}
            onHire={() => {
              setHireTarget(profileModal);
              setProfileModal(null);
            }}
            onClose={() => setProfileModal(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default Browse;
