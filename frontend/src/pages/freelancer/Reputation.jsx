import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/freelancer/Reputation.css";

import { Card, Stars } from "../../components/ui";
import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";

const Reputation = ({ account, signer, provider, toast }) => {
  const [rep, setRep] = useState(null);

  useEffect(() => {
    loadChain();
  }, [account]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      const [avg, total] = await c.getFreelancerReputation(account);
      setRep({ avg: Number(avg), total: Number(total) });
    } catch (e) {
      toast("Failed to load reputation: " + e.message, "error");
    }
  };

  return (
    <div className="page-section">
      <h2 className="section-heading">My Reputation</h2>

      {!rep ? (
        <Card>
          <div className="empty-state">
            <p>No ratings yet.</p>
          </div>
        </Card>
      ) : (
        <div className="rep-grid">
          {/* Average score */}
          <Card className="rep-card" accent="#f59e0b">
            <div className="rep-card__score">
              {(rep.avg / 100).toFixed(1)}
            </div>
            <div className="rep-card__stars">
              <Stars value={Math.round(rep.avg / 100)} readonly />
            </div>
            <p className="rep-card__label">Average Score</p>
          </Card>

          {/* Total jobs rated */}
          <Card className="rep-card">
            <div className="rep-card__count">{rep.total}</div>
            <p className="rep-card__label" style={{ marginTop: 18 }}>
              Jobs Rated
            </p>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Reputation;
