import "../styles/pages/Landing.css";
import { Spinner } from "../components/ui";

const FEATURES = [
  { icon: "🔒", title: "Escrow",       text: "Funds locked until work confirmed" },
  { icon: "📦", title: "IPFS Proof",   text: "Deliverables hashed on-chain, immutable" },
  { icon: "⭐", title: "Reputation",   text: "On-chain ratings, tamper-proof history" },
];

const Landing = ({ connect, connecting }) => (
  <div className="landing">
    <p className="landing__eyebrow">On-chain · Trustless · IPFS-Verified</p>

    <h1 className="landing__headline">
      Freelancing built on<br />
      <span className="landing__headline-accent">smart contracts</span>
    </h1>

    <p className="landing__subtitle">
      Escrow payments · IPFS deliverables · On-chain reputation.<br />
      No middlemen. No disputes. Just code.
    </p>

    <div className="landing__actions">
      <button
        className="landing__cta-primary"
        onClick={connect}
        disabled={connecting}
      >
        {connecting && <Spinner size={16} />}
        Connect Wallet
      </button>

    </div>

    <div className="landing__features">
      {FEATURES.map((f) => (
        <div className="feature-card" key={f.title}>
          <div className="feature-card__icon">{f.icon}</div>
          <div className="feature-card__title">{f.title}</div>
          <p className="feature-card__text">{f.text}</p>
        </div>
      ))}
    </div>
  </div>
);

export default Landing;
