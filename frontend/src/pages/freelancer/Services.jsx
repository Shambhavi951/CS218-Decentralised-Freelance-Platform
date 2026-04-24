// import { useState } from "react";
// import { uploadJsonToIPFS, cidToBytes32 } from "../../utils/ipfs";
// import { ethers } from "ethers";

// export default function Services({ contract, reload }) {
//   const [form, setForm] = useState({ title: "", price: "" });

//   const create = async () => {
//     const cid = await uploadJsonToIPFS({ title: form.title });
//     const hash = cidToBytes32(cid);

//     await (await contract.offerService(
//       ethers.parseEther(form.price),
//       hash
//     )).wait();

//     reload();
//   };

//   return (
//     <div>
//       <input placeholder="Title" onChange={e => setForm({...form, title: e.target.value})} />
//       <input placeholder="Price" onChange={e => setForm({...form, price: e.target.value})} />
//       <button onClick={create}>Create</button>
//     </div>
//   );
// }


import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../styles/pages/freelancer/Services.css";

import { Btn, Card, Input, Textarea, InfoBox } from "../../components/ui";
import Modal      from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";

import { ABI } from "../../constants/abi";
import { CONTRACT_ADDRESS } from "../../constants/config";
import { computeCid, saveMeta, loadMeta } from "../../utils/ipfs";

const Services = ({ account, signer, provider, toast }) => {
  const [services, setServices] = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [open,     setOpen]     = useState(false);
  const [form,     setForm]     = useState({ title: "", desc: "", price: "" });

  /* ── Load ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    loadChain();
  }, [account]); // eslint-disable-line

  const loadChain = async () => {
    if (!signer && !provider) return;
    if (!account) return;
    if (!CONTRACT_ADDRESS) {
      toast("Failed to load services: contract address is not configured", "error");
      return;
    }
    
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider ?? signer);
      
      // Validate contract methods exist
      if (typeof c.serviceCount !== 'function') {
        toast("Failed to load services: contract.serviceCount is not a function", "error");
        return;
      }
      if (typeof c.getService !== 'function') {
        toast("Failed to load services: contract.getService is not a function", "error");
        return;
      }
      
      const cnt = Number(await c.serviceCount());
      const list = [];
      for (let i = 1; i <= cnt; i++) {
        const s = await c.getService(i);
        if (s.freelancer.toLowerCase() !== account.toLowerCase()) continue;
        const m = loadMeta(s.metadataCid) ?? {};
        list.push({
          id: i,
          freelancer:  s.freelancer,
          status:      Number(s.status),
          priceWei:    s.priceWei.toString(),
          metadataCid: s.metadataCid,
          title:       m.title       ?? "Untitled",
          description: m.description ?? "",
          mine: true,
        });
      }
      setServices(list);
    } catch (e) {
      toast("Failed to load services: " + e.message, "error");
    }
  };

  /* ── Offer ────────────────────────────────────────────────────────── */
  const handleOffer = async () => {
    const { title, desc, price } = form;
    if (!title || !price || isNaN(price) || Number(price) <= 0) {
      toast("Please fill all fields with valid values", "error");
      return;
    }
    setBusy(true);
    try {
      const cid = await computeCid(title + desc);
      saveMeta(cid, { title, description: desc });

      const activeSigner = signer ?? provider?.getSigner();
      if (!activeSigner) {
        toast("Connect your wallet first", "error");
        setBusy(false);
        return;
      }

      const c  = new ethers.Contract(CONTRACT_ADDRESS, ABI, activeSigner);
      const tx = await c.offerService(ethers.parseEther(price), cid);
      toast("Waiting for confirmation…");
      await tx.wait();
      toast("Service listed on-chain!", "success");
      await loadChain();
      setOpen(false);
      setForm({ title: "", desc: "", price: "" });
    } catch (e) {
      toast(e.reason ?? e.message ?? "Transaction failed", "error");
    }
    setBusy(false);
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="page-section">
      {/* Header row */}
      <div className="services-header">
        <h2 className="section-heading" style={{ marginBottom: 0 }}>My Services</h2>
        <Btn onClick={() => setOpen(true)} accent="#f59e0b">
          + Offer New Service
        </Btn>
      </div>

      {/* Grid */}
      {services.length === 0 ? (
        <Card>
          <div className="empty-state">
            <div className="empty-state__icon">🛠</div>
            <p>No services yet — list your first one.</p>
          </div>
        </Card>
      ) : (
        <div className="services-grid">
          {services.map((svc) => (
            <Card key={svc.id} className="service-card">
              <div className="service-card__top">
                <span className="service-card__id">#{svc.id}</span>
                <StatusBadge kind="service" status={svc.status} />
              </div>
              <h3 className="service-card__title">{svc.title}</h3>
              <p className="service-card__desc">{svc.description}</p>
              <div className="service-card__footer">
                <span className="service-card__price">
                  {parseFloat(ethers.formatEther(svc.priceWei)).toFixed(3)} ETH
                </span>
                <span className="service-card__cid">
                  {svc.metadataCid?.slice(0, 14)}…
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Offer modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Offer New Service"
        accent="#f59e0b"
      >
        <Input
          label="Title"
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="e.g. Build DeFi Dashboard"
        />
        <Textarea
          label="Description (stored off-chain via IPFS hash)"
          value={form.desc}
          onChange={(v) => setForm((f) => ({ ...f, desc: v }))}
          placeholder="What will you deliver?"
          rows={3}
        />
        <Input
          label="Price (ETH)"
          type="number"
          value={form.price}
          onChange={(v) => setForm((f) => ({ ...f, price: v }))}
          placeholder="e.g. 1.5"
        />
        <InfoBox color="#4ade80">
          💡 Title + description are SHA-256 hashed → 32-byte CID stored on-chain
          (~512 gas vs ~40 000 gas for raw strings). The human-readable text lives on
          IPFS.
        </InfoBox>
        <div className="modal__footer">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn onClick={handleOffer} loading={busy} accent="#f59e0b">
            List Service
          </Btn>
        </div>
      </Modal>
    </div>
  );
};

export default Services;
