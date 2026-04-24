import { useState, useEffect } from "react";
import { Card, Chip, Stars, Btn, Spinner } from "./ui";

const ICON_SEEDS = ["Aiden", "Luna", "Max", "Bella", "Charlie", "Daisy", "Rocky", "Zoe"];

export default function FreelancerProfile({ 
  freelancerId, 
  context, 
  onHire, 
  onClose,
  jobContext,
  reputation 
}) {
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  useEffect(() => {
    if (!freelancerId) return;
    setLoading(true);
    
    // Simulate async data fetching to handle loading state
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`profile_${freelancerId.toLowerCase()}`);
        if (saved) {
          setProfileData(JSON.parse(saved));
        } else {
          setProfileData(null);
        }
      } catch (err) {
        console.error("Failed to parse profile data from localStorage", err);
        setProfileData(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    
    return () => clearTimeout(timer);
  }, [freelancerId]);

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <Spinner size={32} />
        </div>
      );
    }

    const { displayName, bio, selectedIcon, portfolio } = profileData || {};

    return (
      <div className="freelancer-profile-view">
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
          <img 
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedIcon || ICON_SEEDS[0]}`} 
            alt="Avatar" 
            style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#f3f4f6", padding: "8px" }}
          />
          <div>
            <h2 style={{ margin: "0 0 8px" }}>{displayName || "Unnamed Freelancer"}</h2>
            <Chip addr={freelancerId} />
          </div>
        </div>

        {reputation && (
          <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontWeight: "bold", fontSize: "18px" }}>
              {(reputation.avg / 100).toFixed(1)}/5
            </div>
            <Stars value={Math.round(reputation.avg / 100)} readonly />
            <span style={{ color: "#666", fontSize: "14px" }}>
              ({reputation.total || reputation.jobs || 0} jobs)
            </span>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <h4 style={{ margin: "0 0 8px" }}>About</h4>
          <p style={{ color: "#555", lineHeight: "1.5", margin: 0 }}>
            {bio || "This freelancer hasn't added a bio yet."}
          </p>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <h4 style={{ margin: "0 0 12px" }}>Portfolio</h4>
          {portfolio && portfolio.length > 0 ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {portfolio.map((item) => (
                <Card key={item.id} style={{ padding: "12px" }}>
                  <div style={{ fontWeight: "bold" }}>{item.title}</div>
                  <div style={{ fontSize: "14px", color: "#666", margin: "4px 0" }}>{item.description}</div>
                  <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#38bdf8", textDecoration: "none" }}>{item.link}</a>
                </Card>
              ))}
            </div>
          ) : (
            <p style={{ color: "#999", fontStyle: "italic", margin: 0 }}>No portfolio projects added.</p>
          )}
        </div>

        {/* Conditional UI based on context */}
        {context === "hired" && jobContext && (
          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #eee" }}>
            <h4 style={{ margin: "0 0 8px" }}>Work History / Status</h4>
            <Card style={{ padding: "12px", borderLeft: "4px solid #10b981" }}>
              <div style={{ fontWeight: "bold" }}>{jobContext.title}</div>
              <div style={{ color: "#666", fontSize: "14px", marginTop: "4px" }}>
                Status: {
                  ["Pending", "Work Submitted", "Completed", "Refunded"][jobContext.status]
                }
              </div>
            </Card>
          </div>
        )}

        {context === "browse" && (
          <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            {onClose && <Btn variant="ghost" onClick={onClose}>Close</Btn>}
            {onHire && <Btn accent="#38bdf8" onClick={onHire}>Hire Now</Btn>}
          </div>
        )}
        
        {context === "hired" && onClose && (
          <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        )}
      </div>
    );
  };

  return renderContent();
}
