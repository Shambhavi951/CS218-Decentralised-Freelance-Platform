import "../styles/components/ToastList.css";

/**
 * @param {Array} toasts — [{ id, msg, type: "info"|"success"|"error" }]
 */
const ToastList = ({ toasts }) => (
  <div className="toast-list" aria-live="polite">
    {toasts.map((t) => (
      <div key={t.id} className={`toast toast--${t.type}`}>
        {t.msg}
      </div>
    ))}
  </div>
);

export default ToastList;