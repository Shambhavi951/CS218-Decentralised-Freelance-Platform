import "../../styles/components/ui.css";

/* ─── Spinner ───────────────────────────────────────────────────────────── */
export const Spinner = ({ size = 16 }) => (
  <span
    className="ui-spinner"
    style={{ width: size, height: size }}
  />
);

/* ─── Button ────────────────────────────────────────────────────────────── */
export const Btn = ({
  children,
  onClick,
  variant = "primary",
  disabled,
  loading,
  accent,
  sm,
}) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    className={`ui-btn ui-btn--${variant}${sm ? " ui-btn--sm" : ""}`}
    style={accent ? { "--btn-accent": accent } : {}}
  >
    {loading && <Spinner size={14} />}
    {children}
  </button>
);

/* ─── Card ──────────────────────────────────────────────────────────────── */
export const Card = ({ children, className = "", accent, style }) => (
  <div
    className={`ui-card ${className}`}
    style={{
      borderColor: accent ? `${accent}30` : undefined,
      boxShadow: accent ? `0 0 24px ${accent}10` : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ─── Input ─────────────────────────────────────────────────────────────── */
export const Input = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}) => (
  <label className="ui-field">
    {label && <span className="ui-field__label">{label}</span>}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`ui-input${mono ? " ui-input--mono" : ""}`}
    />
  </label>
);

/* ─── Textarea ──────────────────────────────────────────────────────────── */
export const Textarea = ({ label, value, onChange, placeholder, rows = 3 }) => (
  <label className="ui-field">
    {label && <span className="ui-field__label">{label}</span>}
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="ui-textarea"
    />
  </label>
);

/* ─── Stars ─────────────────────────────────────────────────────────────── */
export const Stars = ({ value, onChange, readonly = false }) => (
  <div className="ui-stars">
    {[1, 2, 3, 4, 5].map((n) => (
      <span
        key={n}
        onClick={() => !readonly && onChange(n)}
        className={`ui-stars__star${n <= value ? " ui-stars__star--active" : ""}${readonly ? " ui-stars__star--readonly" : ""}`}
      >
        ★
      </span>
    ))}
  </div>
);

/* ─── Chip (short address) ──────────────────────────────────────────────── */
export const Chip = ({ addr }) => {
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";
  return <span className="ui-chip">{short}</span>;
};

/* ─── InfoBox ───────────────────────────────────────────────────────────── */
export const InfoBox = ({ children, color = "#38bdf8" }) => (
  <div
    className="ui-infobox"
    style={{
      background: `${color}0e`,
      border: `1px solid ${color}30`,
      color,
    }}
  >
    {children}
  </div>
);

/* ─── Tabs ──────────────────────────────────────────────────────────────── */
export const Tabs = ({ tabs, active, onChange }) => (
  <div className="ui-tabs">
    {tabs.map((tab) => (
      <button
        key={tab.value}
        onClick={() => onChange(tab.value)}
        className={`ui-tabs__tab${active === tab.value ? " ui-tabs__tab--active" : ""}`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
