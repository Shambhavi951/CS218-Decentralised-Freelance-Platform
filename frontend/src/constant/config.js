
// ─────────────────────────────────────────────
// CONTRACT CONFIG
// ─────────────────────────────────────────────

export const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? "";

export const CHAIN_ID =
  Number(import.meta.env.VITE_CHAIN_ID ?? 31337); // localhost default

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

// Empty CID (means no work submitted / cleared)
export const ZERO_CID =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const NOW = Math.floor(Date.now() / 1000);

// ─────────────────────────────────────────────
// STATUS LABELS (from your contract enums)
// ─────────────────────────────────────────────

export const SERVICE_STATUS = [
  "Listed",     // 0
  "Hired",      // 1
  "Completed",  // 2
  "Cancelled"   // 3
];

export const JOB_STATUS = [
  "Active",     // 0
  "Submitted",  // 1
  "Done",       // 2
  "Cancelled"   // 3
];

// ─────────────────────────────────────────────
// OPTIONAL UI STYLES
// ─────────────────────────────────────────────

export const STATUS_STYLE = {
  Listed:     { bg: "#0d2b18", text: "#4ade80" },
  Hired:      { bg: "#2b1a06", text: "#fb923c" },
  Active:     { bg: "#1e1b4b", text: "#a78bfa" },
  Submitted:  { bg: "#083344", text: "#22d3ee" },
  Done:       { bg: "#064e3b", text: "#34d399" },
  Cancelled:  { bg: "#2b0c0c", text: "#f87171" }
};