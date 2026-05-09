import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import "../styles/pages/DiscountTokens.css";

import { Btn, Card } from "../components/ui";
import Modal from "../components/Modal";

import ABI from "../constants/abi";
import { CONTRACT_ADDRESS } from "../constants/config";
import { fmtEth } from "../utils/helpers";

// ── helpers ──────────────────────────────────────────────────────────────────

const now = () => Math.floor(Date.now() / 1000);

function tokenStatus(dt) {
  if (dt.redeemed) return "redeemed";
  if (Number(dt.expiry) < now()) return "expired";
  return "active";
}

function fmtExpiry(expiry) {
  const ts = Number(expiry);
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function timeRemaining(expiry) {
  const secs = Number(expiry) - now();
  if (secs <= 0) return "Expired";
  const days = Math.floor(secs / 86400);
  const hrs = Math.floor((secs % 86400) / 3600);
  if (days > 0) return `${days}d ${hrs}h left`;
  const mins = Math.floor((secs % 3600) / 60);
  return `${hrs}h ${mins}m left`;
}

// ── component ─────────────────────────────────────────────────────────────────

const DiscountTokens = ({ account, signer, provider, toast }) => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // discountId | null
  const [filter, setFilter] = useState("all"); // "all" | "active" | "redeemed" | "expired"

  /* ── Load ────────────────────────────────────────────────────────────── */
  const loadChain = useCallback(async () => {
    if (!account || (!signer && !provider)) return;
    setLoading(true);
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);

      // Fetch all discount IDs owned by the current user
      const ids = await c.getReviewerDiscounts(account);

      const list = [];
      for (const id of ids) {
        try {
          const dt = await c.getDiscountToken(id);
          list.push({
            id: Number(id),
            reviewer: dt.reviewer,
            jobId: Number(dt.jobId),
            redeemed: dt.redeemed,
            discountWei: dt.discountWei.toString(),
            expiry: Number(dt.expiry),
            feedbackTokenId: Number(dt.feedbackTokenId),
            status: tokenStatus(dt),
          });
        } catch (e) {
          console.warn("Failed to load discount token", Number(id), e);
        }
      }

      // Most-recent first
      list.sort((a, b) => b.id - a.id);
      setTokens(list);
    } catch (e) {
      console.error("loadChain (discounts) error:", e);
      toast("Failed to load discount tokens: " + e.message, "error");
    }
    setLoading(false);
  }, [account, signer, provider, toast]);

  useEffect(() => {
    loadChain();
  }, [loadChain]);

  /* ── Use token ───────────────────────────────────────────────────────── */
  const handleUse = async () => {
    if (!confirmModal) return;
    setBusy(true);
    try {
      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.useDiscountToken(confirmModal);
      toast("Redeeming discount token…");
      await tx.wait();
      toast("Discount token redeemed! Show this to your next hire as proof.", "success");
      setConfirmModal(null);
      await loadChain();
    } catch (e) {
      toast(e.reason ?? e.message ?? "Failed to redeem", "error");
    }
    setBusy(false);
  };

  /* ── Filtered list ───────────────────────────────────────────────────── */
  const displayed = filter === "all" ? tokens : tokens.filter(t => t.status === filter);
  const counts = {
    all: tokens.length,
    active: tokens.filter(t => t.status === "active").length,
    redeemed: tokens.filter(t => t.status === "redeemed").length,
    expired: tokens.filter(t => t.status === "expired").length,
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      <div className="dt-header">
        <div>
          <h2 className="section-heading" style={{ marginBottom: 4 }}>🎟 My Discount Tokens</h2>
          <p className="dt-subtitle">
            Earned automatically when you submit feedback. Each token gives a 5% discount
            on your next job escrow and is valid for 30 days.
          </p>
        </div>
        <button
          className="dt-refresh-btn"
          onClick={loadChain}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Info banner */}
      <Card className="dt-info-card">
        <div className="dt-info-grid">
          <div className="dt-info-item">
            <span className="dt-info-icon">💸</span>
            <div>
              <div className="dt-info-label">Discount Rate</div>
              <div className="dt-info-value">5% of job value</div>
            </div>
          </div>
          <div className="dt-info-item">
            <span className="dt-info-icon">⏳</span>
            <div>
              <div className="dt-info-label">Validity</div>
              <div className="dt-info-value">30 days after rating</div>
            </div>
          </div>
          <div className="dt-info-item">
            <span className="dt-info-icon">✅</span>
            <div>
              <div className="dt-info-label">How to earn</div>
              <div className="dt-info-value">Submit feedback on completed jobs</div>
            </div>
          </div>
          <div className="dt-info-item">
            <span className="dt-info-icon">🔖</span>
            <div>
              <div className="dt-info-label">Total tokens</div>
              <div className="dt-info-value">{counts.all} ({counts.active} active)</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="dt-filter-row">
        {["all", "active", "redeemed", "expired"].map(f => (
          <button
            key={f}
            className={`dt-filter-btn${filter === f ? " dt-filter-btn--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="dt-filter-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Token list */}
      {loading ? (
        <Card><div className="empty-state"><p>Loading tokens…</p></div></Card>
      ) : displayed.length === 0 ? (
        <Card>
          <div className="empty-state">
            <div className="empty-state__icon">🎟</div>
            <p>
              {filter === "all"
                ? "No discount tokens yet. Submit feedback on a completed job to earn one!"
                : `No ${filter} tokens.`}
            </p>
          </div>
        </Card>
      ) : (
        <div className="dt-list">
          {displayed.map(dt => {
            const isActive = dt.status === "active";
            const isRedeemed = dt.status === "redeemed";
            const statusColor = isActive ? "#4ade80" : isRedeemed ? "#f59e0b" : "#6b7280";

            return (
              <Card key={dt.id} className="dt-card" style={{ borderLeftColor: statusColor }}>
                <div className="dt-card__header">
                  <div className="dt-card__id-row">
                    <span className="dt-card__id">Discount #{dt.id}</span>
                    <span
                      className={`dt-card__badge dt-card__badge--${dt.status}`}
                    >
                      {isActive ? "🟢 Active" : isRedeemed ? "🟡 Used" : "⚫ Expired"}
                    </span>
                  </div>
                  <div className="dt-card__job-ref">For Job #{dt.jobId}</div>
                </div>

                <div className="dt-card__body">
                  <div className="dt-card__discount-amount">
                    <span className="dt-card__discount-label">Discount value</span>
                    <span className="dt-card__discount-value">
                      {fmtEth(dt.discountWei)}
                    </span>
                    <span className="dt-card__discount-note">(5% of job escrow)</span>
                  </div>

                  <div className="dt-card__meta">
                    <div className="dt-card__meta-row">
                      <span className="dt-card__meta-label">Expires</span>
                      <span className="dt-card__meta-val">{fmtExpiry(dt.expiry)}</span>
                    </div>
                    {isActive && (
                      <div className="dt-card__time-left">
                        ⏱ {timeRemaining(dt.expiry)}
                      </div>
                    )}
                    <div className="dt-card__meta-row">
                      <span className="dt-card__meta-label">Feedback token</span>
                      <span className="dt-card__meta-val">#{dt.feedbackTokenId}</span>
                    </div>
                  </div>

                  {isActive && (
                    <div className="dt-tip-box">
                      💡 Redeem this token on-chain to mark it as used. Present it to the other party as proof of your loyalty discount when negotiating your next job.
                    </div>
                  )}
                  {isRedeemed && (
                    <div className="dt-card__redeemed-banner">
                      ✓ This discount has been redeemed
                    </div>
                  )}
                  {dt.status === "expired" && (
                    <div className="dt-card__expired-banner">
                      ✗ This discount expired without being used
                    </div>
                  )}
                </div>

                {isActive && (
                  <div className="dt-card__actions">
                    <Btn
                      sm
                      accent="#4ade80"
                      onClick={() => setConfirmModal(dt.id)}
                    >
                      🎟 Redeem Discount
                    </Btn>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm redeem modal */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Redeem Discount Token"
        accent="#4ade80"
      >
        {confirmModal && (() => {
          const dt = tokens.find(t => t.id === confirmModal);
          return (
            <div>
              <p style={{ marginBottom: 16, color: "var(--text2)", lineHeight: 1.6 }}>
                You are about to redeem <strong style={{ color: "var(--text)" }}>Discount #{confirmModal}</strong> (Job #{dt?.jobId}).
                This will mark the token as <strong>used on-chain</strong>.
              </p>
              <div className="dt-confirm-amount">
                <span className="dt-confirm-amount__label">Discount value</span>
                <span className="dt-confirm-amount__value">{dt ? fmtEth(dt.discountWei) : "—"}</span>
              </div>
              <div className="dt-warn-box">
                ⚠️ This action is irreversible. Once redeemed, the token cannot be used again. Make sure you're redeeming at the right time (e.g., when hiring for a new job).
              </div>
              <div className="modal__footer">
                <Btn variant="ghost" onClick={() => setConfirmModal(null)}>Cancel</Btn>
                <Btn accent="#4ade80" onClick={handleUse} loading={busy}>
                  Confirm Redeem
                </Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default DiscountTokens;
