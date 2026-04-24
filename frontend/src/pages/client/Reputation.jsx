import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/client/Reputation.css";

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
    if (!account) return;
    if (!CONTRACT_ADDRESS) {
      toast("Failed to load reputation: contract address is not configured", "error");
      return;
    }

    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      const [avgScoreScaled, totalWeight, totalJobs] = await c.getClientReputation(account);
      setRep({ avg: Number(avgScoreScaled), weight: Number(totalWeight), jobs: Number(totalJobs) });
    } catch (e) {
      toast("Failed to load reputation: " + e.message, "error");
    }
  };

  const average = rep ? rep.weight > 0 ? rep.avg / 100 : 0 : 0;

  return (
    <div className="page-section">
      <h2 className="section-heading">My Reputation</h2>

      {!rep ? (
        <Card>
          <div className="empty-state">
            <p>Loading your reputation…</p>
          </div>
        </Card>
      ) : (
        <div className="client-rep-grid">
          <Card className="client-rep-card" accent="#38bdf8">
            <div className="client-rep-card__score">{average.toFixed(1)}</div>
            <div className="client-rep-card__stars">
              <Stars value={Math.round(average)} readonly />
            </div>
            <p className="client-rep-card__label">Average Score</p>
          </Card>

          <Card className="client-rep-card">
            <div className="client-rep-card__stat">
              <span className="client-rep-card__stat-value">{rep.jobs}</span>
              <span className="client-rep-card__stat-label">Total Ratings</span>
            </div>
            {rep.jobs === 0 && (
              <p className="client-rep-card__none">You have not received any client ratings yet.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

export default Reputation;
