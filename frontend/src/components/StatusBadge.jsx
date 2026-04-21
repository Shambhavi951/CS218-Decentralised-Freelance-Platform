import "../styles/components/StatusBadge.css";
import { SERVICE_STATUS, JOB_STATUS, STATUS_STYLE } from "../utils/helpers";

/**
 * @param {"service"|"job"} kind
 * @param {number}          status  — 0-3
 */
const StatusBadge = ({ kind, status }) => {
  const label = kind === "service" ? SERVICE_STATUS[status] : JOB_STATUS[status];
  const style = STATUS_STYLE[label] ?? {};

  return (
    <span
      className="status-badge"
      style={{
        background:   style.bg,
        color:        style.text,
        borderColor:  style.border,
      }}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
