// import { ethers } from "ethers";
// import { NOW, ZERO_CID, SVC_LABEL, JOB_LABEL, SVC_STYLE } from "../constants/config";

// export { SVC_LABEL, JOB_LABEL, SVC_STYLE };

// /** Shorten a wallet address to 0x1234…abcd */
// export const shorten = (addr) =>
//   addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

// /** Format a wei string to "1.500 ETH" */
// export const fmtEth = (wei) => {
//   try {
//     return parseFloat(ethers.utils.formatEther(wei || "0")).toFixed(3) + " ETH";
//   } catch {
//     return "? ETH";
//   }
// };

// /** Human-readable time remaining from a unix timestamp */
// export const timeLeft = (ts) => {
//   const d = ts - NOW;
//   if (d < 0) return "Expired";
//   if (d > 86400) return `${Math.floor(d / 86400)}d ${Math.floor((d % 86400) / 3600)}h`;
//   return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
// };

// /** True when a workCid is the zero sentinel */
// export const isZeroCid = (c) => !c || c === ZERO_CID || c === "0x";






import { ethers } from "ethers";
import {
  ZERO_CID,
  SERVICE_STATUS,
  JOB_STATUS,
  STATUS_STYLE
} from "../constants/config";

// Re-export for UI use
export { SERVICE_STATUS, JOB_STATUS, STATUS_STYLE };

/** Shorten wallet address → 0x1234…abcd */
export const shorten = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "—";

/** Format wei → "1.500 ETH" */
export const fmtEth = (wei) => {
  try {
    return parseFloat(ethers.formatEther(wei || 0)).toFixed(3) + " ETH";
  } catch {
    return "? ETH";
  }
};

/** Time remaining from unix timestamp */
export const timeLeft = (ts) => {
  const now = Math.floor(Date.now() / 1000); // ✅ dynamic time
  const d = ts - now;

  if (d <= 0) return "Expired";

  if (d > 86400) {
    const days = Math.floor(d / 86400);
    const hours = Math.floor((d % 86400) / 3600);
    return `${days}d ${hours}h`;
  }

  const hours = Math.floor(d / 3600);
  const mins = Math.floor((d % 3600) / 60);

  return `${hours}h ${mins}m`;
};

/** Check if CID is empty */
export const isZeroCid = (c) =>
  !c || c === ZERO_CID || c === "0x";