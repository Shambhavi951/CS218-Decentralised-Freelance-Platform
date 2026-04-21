// import { ethers } from "ethers";

// export async function uploadJsonToIPFS(data) {
//   const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
//   const form = new FormData();
//   form.append("file", blob);

//   const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}` },
//     body: form,
//   });

//   const json = await res.json();
//   return json.IpfsHash;
// }

// export async function uploadFileToIPFS(file) {
//   const form = new FormData();
//   form.append("file", file);

//   const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}` },
//     body: form,
//   });

//   const json = await res.json();
//   return json.IpfsHash;
// }

// export const cidToBytes32 = (cid) =>
//   ethers.keccak256(ethers.toUtf8Bytes(cid));



// /**
//  * IPFS / CID helpers
//  *
//  * In this app we simulate IPFS with a SHA-256 hash of the content.
//  * In production, replace computeCid() with a real IPFS upload via
//  * web3.storage, Pinata, or your own node.
//  */

// /**
//  * Hash arbitrary text to a 32-byte hex string (simulated CID).
//  * Production: upload to IPFS first, then keccak256(bytes(realCID)).
//  */
// export const computeCid = async (text) => {
//   const buf = await crypto.subtle.digest(
//     "SHA-256",
//     new TextEncoder().encode(text)
//   );
//   return (
//     "0x" +
//     Array.from(new Uint8Array(buf))
//       .map((b) => b.toString(16).padStart(2, "0"))
//       .join("")
//   );
// };

// const metaKey = (cid) => "cw_meta_" + cid;

// /**
//  * Persist service metadata (title + description) in localStorage
//  * so we can display it without an IPFS gateway.
//  */
// export const saveMeta = (cid, data) => {
//   try {
//     localStorage.setItem(metaKey(cid), JSON.stringify(data));
//   } catch {}
// };

// /** Retrieve previously saved metadata for a CID. */
// export const loadMeta = (cid) => {
//   try {
//     return JSON.parse(localStorage.getItem(metaKey(cid)));
//   } catch {
//     return null;
//   }
// };





import { ethers } from "ethers";

/**
 * Upload JSON metadata (title, description) to IPFS via Pinata
 */
export async function uploadJsonToIPFS(data) {
  const blob = new Blob([JSON.stringify(data)], {
    type: "application/json"
  });

  const form = new FormData();
  form.append("file", blob, "metadata.json");

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`
    },
    body: form
  });

  if (!res.ok) throw new Error("IPFS upload failed");

  const json = await res.json();
  return json.IpfsHash; // real CID
}

/**
 * Upload file (work submission) to IPFS
 */
export async function uploadFileToIPFS(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`
    },
    body: form
  });

  if (!res.ok) throw new Error("File upload failed");

  const json = await res.json();
  return json.IpfsHash;
}

/**
 * Simulate IPFS CID creation by hashing text.
 * In production, replace this with a real IPFS upload.
 */
export const computeCid = async (text) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return (
    "0x" +
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
};

const metaKey = (cid) => "cw_meta_" + cid;

export const saveMeta = (cid, data) => {
  try {
    localStorage.setItem(metaKey(cid), JSON.stringify(data));
  } catch {}
};

export const loadMeta = (cid) => {
  try {
    return JSON.parse(localStorage.getItem(metaKey(cid)));
  } catch {
    return null;
  }
};

/**
 * Convert CID → bytes32 for contract
 */
export const cidToBytes32 = (cid) =>
  ethers.keccak256(ethers.toUtf8Bytes(cid));

/**
 * Convert CID → viewable URL
 */
export const getIPFSUrl = (cid) =>
  `https://gateway.pinata.cloud/ipfs/${cid}`;