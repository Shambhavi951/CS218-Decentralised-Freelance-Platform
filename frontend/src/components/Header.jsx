import "../styles/components/Header.css";
import { Btn, Spinner } from "./ui";
import { shorten } from "../utils/helpers";

const ROLES = [
  { key: "freelancer", icon: "⚒", label: "Freelancer" },
  { key: "client",     icon: "💼", label: "Client"     },
];

const Header = ({
  role,
  setRole,
  account,
  connect,
  connecting,
  chainId,
  accountRefreshNeeded,
  refreshAccount,
}) => {
  const accent = role === "freelancer" ? "#f59e0b" : "#38bdf8";

  return (
    <header className="header">

      {/* ── Brand ─────────────────────────────────────────────────────── */}
      <div className="header__brand">
        <div
          className="header__brand-icon"
          style={{
            borderColor: `${accent}55`,
            background:  `${accent}18`,
          }}
        >
          ⛓
        </div>
        <span className="header__brand-name">
          Chain<span style={{ color: accent }}>Work</span>
        </span>
      </div>

      {/* ── Role toggle ───────────────────────────────────────────────── */}
      <div className="header__center">
        <div className="header__role-toggle">
          {ROLES.map((r) => (
            <button
              key={r.key}
              className={[
                "header__role-btn",
                role === r.key
                  ? `header__role-btn--active-${r.key}`
                  : "",
              ].join(" ")}
              onClick={() => setRole(r.key)}
            >
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: badges + wallet ────────────────────────────────────── */}
      <div className="header__right">
        {chainId && (
          <span className="header__badge header__badge--chain">
            chain {chainId}
          </span>
        )}

        {account ? (
          <div
            className="header__wallet"
            style={{ borderColor: `${accent}40` }}
          >
            <span className="header__wallet-dot" />
            <span
              className="header__wallet-addr"
              style={{ color: accent }}
            >
              {shorten(account)}
            </span>
          </div>
        ) : (
          <Btn
            onClick={connect}
            loading={connecting}
            accent={accent}
          >
            Connect Wallet
          </Btn>
        )}
      </div>
    </header>
  );
};

export default Header;
