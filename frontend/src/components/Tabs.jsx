import "../styles/components/Tabs.css";

/**
 * @param {Array}  tabs    — [{ key, label, dot? }]
 * @param {string} active  — currently selected key
 * @param {fn}     onSelect
 * @param {string} accent  — active colour (CSS colour string)
 */
const Tabs = ({ tabs, active, onSelect, accent = "#f59e0b" }) => (
  <nav className="tabs" style={{ "--tab-accent": accent }}>
    {tabs.map((t) => (
      <button
        key={t.key}
        className={`tabs__btn${active === t.key ? " tabs__btn--active" : ""}`}
        onClick={() => onSelect(t.key)}
      >
        {t.label}
        {t.dot && <span className="tabs__dot" />}
      </button>
    ))}
  </nav>
);

export default Tabs;
