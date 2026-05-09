import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Browse.css";

import { Btn, Card, InfoBox, Chip, Stars, Textarea } from "../../components/ui";
import Modal from "../../components/Modal";
import FreelancerProfile from "../../components/FreelancerProfile";

import ABI from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";
import { loadMeta, computeCid, saveMeta } from "../../utils/ipfs";
import { fmtEth } from "../../utils/helpers";

const Browse = ({ account, signer, provider, toast, onHired }) => {
  const [services, setServices] = useState([]);
  const [hireTarget, setHireTarget] = useState(null);
  const [freelancerReps, setFreelancerReps] = useState({}); // freelancer address -> {avg, total}
  const [profileModal, setProfileModal] = useState(null); // svc object | null
  const [jobDescription, setJobDescription] = useState("");
  const [cancellationFee, setCancellationFee] = useState("");
  const [busy, setBusy] = useState(false);

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
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
          id: i,
          freelancer: s.freelancer,
          status: Number(s.status),
          priceWei: s.priceWei.toString(),
          metadataCid: s.metadataCid,
          title: m.title ?? "Untitled",
          description: m.description ?? "",
          deadline: m.deadline ?? 7,
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
    if (!jobDescription || jobDescription.trim().length < 20) {
      toast("Job description must be at least 20 characters long", "error");
      return;
    }

    // Validate cancellation fee
    const priceWei = ethers.toBigInt(hireTarget.priceWei);
    let cancellationFeeWei = 0n;
    if (cancellationFee && cancellationFee.trim() !== "") {
      try {
        cancellationFeeWei = ethers.parseEther(cancellationFee.trim());
      } catch {
        toast("Invalid cancellation fee amount", "error");
        return;
      }
      if (cancellationFeeWei > priceWei) {
        toast("Cancellation fee cannot exceed the job price", "error");
        return;
      }
    }

    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const descText = jobDescription.trim();
      
      // Add validation - description can be empty but let's warn about it
      if (!descText) {
        console.warn("Job description is empty!");
      }
      
      const descriptionCID = await computeCid(descText);
      
      // Normalize to lowercase for consistent key matching
      const descriptionCIDLower = descriptionCID.toLowerCase();
      
      console.log("Hire Flow - descText:", descText);
      console.log("Hire Flow - descriptionCID (original):", descriptionCID);
      console.log("Hire Flow - descriptionCID (normalized):", descriptionCIDLower);

      // Fetch client email from local profile
      let clientEmail = "";
      if (account) {
        const profileStr = localStorage.getItem(`profile_${account.toLowerCase()}`);
        if (profileStr) {
          try {
            clientEmail = JSON.parse(profileStr).email || "";
          } catch (e) {
            console.warn("Failed to parse client profile", e);
          }
        }
      }

     
      // Fetch client email from local profile
  

      saveMeta(descriptionCID, { 
        jobDescription: descText,
        clientEmail: clientEmail
      });
      
      console.log("Hire Flow - metadata saved with key:", `cw_meta_${descriptionCIDLower}`);

      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (hireTarget.deadline * 86400);
      
      // Ensure all parameters are properly typed
      const serviceId = Number(hireTarget.id); // uint32
      const deadline = BigInt(deadlineTimestamp); // uint64
      
      // Ensure descriptionCID is properly formatted as bytes32
      // SHA-256 produces 64 hex chars, add 0x prefix to make it valid bytes32
      const jobDescriptionBytes32 = descriptionCIDLower.startsWith('0x')
        ? descriptionCIDLower
        : '0x' + descriptionCIDLower;
      
      // Verify it's exactly 66 chars (0x + 64 hex)
      if (jobDescriptionBytes32.length !== 66) {
        console.error("Invalid bytes32 format! Length:", jobDescriptionBytes32.length, "value:", jobDescriptionBytes32);
        throw new Error("Invalid job description format");
      }
      
      console.log("Hire Flow - Final Parameters:");
      console.log("  serviceId:", serviceId);
      console.log("  deadline:", deadline.toString());
      console.log("  jobDescription:", jobDescriptionBytes32);
      console.log("  cancellationFeeWei:", cancellationFeeWei.toString());
      console.log("  value (ETH):", ethers.formatEther(ethers.toBigInt(hireTarget.priceWei)));
      
      const tx = await c.hireFreelancer(
        serviceId,
        deadline,
        jobDescriptionBytes32,
        cancellationFeeWei,
        {
          value: ethers.toBigInt(hireTarget.priceWei),
        }
      );
      toast("Payment locked in escrow…");
      await tx.wait();
      toast("Hired! Payment locked in escrow.", "success");
      await loadChain();
      onHired?.();
      setHireTarget(null);
      setJobDescription("");
      setCancellationFee("");
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

              <div className="browse-card__footer" style={{ display: "flex", alignItems: "center" }}>
                <span className="browse-card__price">
                  {fmtEth(svc.priceWei)}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text2)", background: "var(--bg2)", padding: "4px 8px", borderRadius: "12px", marginLeft: "auto", marginRight: "12px" }}>
                  ⏱ {svc.deadline} {svc.deadline === 1 ? 'day' : 'days'}
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
        onClose={() => { setHireTarget(null); setJobDescription(""); setCancellationFee(""); }}
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

            <div style={{ marginTop: "1rem" }}>
              <Textarea
                label="Job Description"
                placeholder="Describe your project requirements... (min 20 characters)"
                value={jobDescription}
                onChange={(v) => setJobDescription(v)}
                rows={4}
              />
            </div>

            {/* Cancellation Fee */}
            <div className="cancellation-fee-section">
              <div className="cancellation-fee__header">
                <span className="cancellation-fee__label">🛡 Cancellation Protection Fee</span>
                <span className="cancellation-fee__optional">optional</span>
              </div>
              <p className="cancellation-fee__desc">
                If <strong>you</strong> cancel this job, this amount is paid to the freelancer
                as compensation. Set to 0 for no penalty.
              </p>
              <div className="cancellation-fee__presets">
                {[0, 10, 25, 50].map((pct) => {
                  const feeEth = pct === 0 ? "0" :
                    ethers.formatEther(
                      (ethers.toBigInt(hireTarget.priceWei) * BigInt(pct)) / 100n
                    );
                  return (
                    <button
                      key={pct}
                      className={`cancellation-fee__preset-btn${
                        (pct === 0 && (cancellationFee === "" || cancellationFee === "0")) ||
                        (pct !== 0 && cancellationFee === feeEth)
                          ? " cancellation-fee__preset-btn--active" : ""
                      }`}
                      onClick={() => setCancellationFee(pct === 0 ? "" : feeEth)}
                      type="button"
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
              <div className="cancellation-fee__input-row">
                <input
                  id="cancellation-fee-input"
                  type="number"
                  min="0"
                  step="0.0001"
                  className="cancellation-fee__input"
                  placeholder="0.0"
                  value={cancellationFee}
                  onChange={(e) => setCancellationFee(e.target.value)}
                />
                <span className="cancellation-fee__unit">ETH</span>
                <span className="cancellation-fee__max">
                  max {fmtEth(hireTarget.priceWei)}
                </span>
              </div>
            </div>

            <InfoBox color="#38bdf8" style={{ marginTop: "1rem" }}>
              ⛓ {fmtEth(hireTarget.priceWei)} will be locked in the smart contract
              escrow until you confirm the work is complete.
            </InfoBox>

            <div className="modal__footer">
              <Btn variant="ghost" onClick={() => { setHireTarget(null); setJobDescription(""); }}>
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
