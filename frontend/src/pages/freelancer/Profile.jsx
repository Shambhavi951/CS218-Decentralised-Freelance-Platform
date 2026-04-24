import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { Card, Btn, Input, Textarea, Chip, InfoBox, Spinner } from "../../components/ui";

const ICON_SEEDS = ["Aiden", "Luna", "Max", "Bella", "Charlie", "Daisy", "Rocky", "Zoe"];

export default function Profile({ account, provider, toast, accent }) {
  const [balance, setBalance] = useState("0.0");
  const [loadingBalance, setLoadingBalance] = useState(false);
  
  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(ICON_SEEDS[0]);
  const [portfolio, setPortfolio] = useState([]);
  
  // New portfolio item state
  const [newTitle, setNewTitle] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const fetchBalance = useCallback(async () => {
    if (!provider || !account) return;
    setLoadingBalance(true);
    try {
      const b = await provider.getBalance(account);
      setBalance(ethers.formatEther(b));
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    } finally {
      setLoadingBalance(false);
    }
  }, [provider, account]);

  // Load profile from localStorage
  useEffect(() => {
    if (!account) return;
    const saved = localStorage.getItem(`profile_${account.toLowerCase()}`);
    if (saved) {
      const data = JSON.parse(saved);
      setDisplayName(data.displayName || "");
      setBio(data.bio || "");
      setSelectedIcon(data.selectedIcon || ICON_SEEDS[0]);
      setPortfolio(data.portfolio || []);
    } else {
        // Reset if no profile found for this account
        setDisplayName("");
        setBio("");
        setSelectedIcon(ICON_SEEDS[0]);
        setPortfolio([]);
    }
    fetchBalance();
  }, [account, fetchBalance]);

  const saveProfile = () => {
    const data = { displayName, bio, selectedIcon, portfolio };
    localStorage.setItem(`profile_${account.toLowerCase()}`, JSON.stringify(data));
    toast("Profile updated successfully!", "success");
  };

  const addPortfolioItem = () => {
    if (!newTitle || !newLink) {
      toast("Title and Link are required", "error");
      return;
    }
    const newItem = {
      id: Date.now(),
      title: newTitle,
      link: newLink,
      description: newDesc
    };
    setPortfolio([...portfolio, newItem]);
    setNewTitle("");
    setNewLink("");
    setNewDesc("");
    toast("Project added to portfolio", "success");
  };

  const removePortfolioItem = (id) => {
    setPortfolio(portfolio.filter(item => item.id !== id));
    toast("Project removed", "info");
  };

  return (
    <div className="profile-container" style={{ display: "grid", gap: "24px", gridTemplateColumns: "1fr 1.5fr" }}>
      
      {/* Left Column: Account & Basic Info */}
      <div style={{ display: "grid", gap: "24px", alignContent: "start" }}>
        <Card accent={accent}>
          <div style={{ padding: "24px", textAlign: "center" }}>
            <div className="profile-avatar-large">
              <img 
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedIcon}`} 
                alt="Profile Avatar" 
                style={{ width: "120px", height: "120px", borderRadius: "50%", background: "#f3f4f6", padding: "10px" }}
              />
            </div>
            <h3 style={{ margin: "16px 0 8px" }}>{displayName || "Unnamed Freelancer"}</h3>
            <Chip addr={account} />
            
            <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid #eee" }}>
              <div style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>Account Balance</div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: accent }}>
                {loadingBalance ? <Spinner /> : `${parseFloat(balance).toFixed(4)} ETH`}
              </div>
              <Btn sm variant="secondary" onClick={fetchBalance} style={{ marginTop: "8px" }}>Refresh</Btn>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: "20px" }}>
            <h4>Choose Profile Icon</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "12px" }}>
              {ICON_SEEDS.map(seed => (
                <div 
                  key={seed}
                  onClick={() => setSelectedIcon(seed)}
                  className="icon-selector-item"
                  style={{ 
                    cursor: "pointer", 
                    padding: "4px", 
                    borderRadius: "8px",
                    border: `2px solid ${selectedIcon === seed ? accent : "transparent"}`,
                  }}
                >
                  <img 
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`} 
                    alt={seed}
                    style={{ width: "100%", height: "auto" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Right Column: Edit Profile & Portfolio */}
      <div style={{ display: "grid", gap: "24px" }}>
        <Card>
          <div style={{ padding: "24px" }}>
            <h3 style={{ marginTop: 0 }}>Profile Settings</h3>
            <div style={{ display: "grid", gap: "16px" }}>
              <Input 
                label="Display Name" 
                value={displayName} 
                onChange={setDisplayName} 
                placeholder="e.g. John Doe"
              />
              <Textarea 
                label="Bio / About" 
                value={bio} 
                onChange={setBio} 
                placeholder="Describe your skills and experience..."
                rows={4}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Btn onClick={saveProfile} accent={accent}>Save Profile</Btn>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: "24px" }}>
            <h3 style={{ marginTop: 0 }}>Portfolio</h3>
            
            {/* Add Project Form */}
            <InfoBox color={accent}>
              <div style={{ display: "grid", gap: "12px" }}>
                <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Add New Project</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Input 
                    placeholder="Project Title" 
                    value={newTitle} 
                    onChange={setNewTitle}
                  />
                  <Input 
                    placeholder="Link (URL)" 
                    value={newLink} 
                    onChange={setNewLink}
                  />
                </div>
                <Input 
                  placeholder="Short Description" 
                  value={newDesc} 
                  onChange={setNewDesc}
                />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn sm onClick={addPortfolioItem} accent={accent}>Add Project</Btn>
                </div>
              </div>
            </InfoBox>

            {/* Project List */}
            <div style={{ marginTop: "24px", display: "grid", gap: "16px" }}>
              {portfolio.length === 0 ? (
                <div style={{ textAlign: "center", color: "#999", padding: "20px" }}>
                  No projects added yet.
                </div>
              ) : (
                portfolio.map(item => (
                  <div key={item.id} className="portfolio-item" style={{ 
                    padding: "16px", 
                    borderRadius: "12px", 
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "16px" }}>{item.title}</div>
                      <div style={{ fontSize: "14px", color: "#666", margin: "4px 0" }}>{item.description}</div>
                      <a 
                        href={item.link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ fontSize: "12px", color: accent, textDecoration: "none" }}
                      >
                        {item.link}
                      </a>
                    </div>
                    <Btn sm variant="secondary" onClick={() => removePortfolioItem(item.id)}>Remove</Btn>
                  </div>
                ))
              )}
            </div>
            
            {portfolio.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                    <Btn variant="secondary" onClick={saveProfile}>Save Portfolio Changes</Btn>
                </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}