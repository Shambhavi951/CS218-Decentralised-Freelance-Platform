import "../styles/components/Modal.css";

/**
 * @param {boolean} open
 * @param {fn}      onClose
 * @param {string}  title
 * @param {string}  accent   — border glow colour
 * @param {node}    children
 */
const Modal = ({ open, onClose, title, accent = "#f59e0b", children }) => {
  if (!open) return null;

  const handleOverlay = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlay}>
      <div
        className="modal"
        style={{ borderColor: `${accent}38` }}
      >
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
