// import { useEffect, useState } from "react";
// import { useWallet } from "./hooks/useWallet";
// import Header from "./components/Header";

// export default function App() {
//   const { account, contract, connect } = useWallet();
//   const [services, setServices] = useState([]);

//   const reload = async () => {
//     if (!contract) return;
//     const count = await contract.serviceCount();

//     let arr = [];
//     for (let i = 1; i <= count; i++) {
//       arr.push(await contract.getService(i));
//     }
//     setServices(arr);
//   };

//   useEffect(() => {
//     reload();
//   }, [contract]);

//   return (
//     <div>
//       <Header account={account} connect={connect} />
//       {/* Add pages here */}
//     </div>
//   );
// }
import { useState } from "react";
import "./styles/global.css";

import { useWallet } from "./hooks/useWallet";
import { useToast  } from "./hooks/useToast";

import Header    from "./components/Header";
import ToastList from "./components/ToastList";
import Tabs      from "./components/Tabs";
import Landing   from "./pages/Landing";
import { Card }  from "./components/ui";
import { CHAIN_ID } from "./constants/config";

// Freelancer pages
import Services    from "./pages/freelancer/Services";
import FreelancerJobs from "./pages/freelancer/Jobs";
import Reputation  from "./pages/freelancer/Reputation";

// Client pages
import Browse     from "./pages/client/Browse";
import ClientJobs from "./pages/client/Jobs";
import Rate       from "./pages/client/Rate";
import ClientReputation from "./pages/client/Reputation";

/* ─── Tab definitions ──────────────────────────────────────────────── */
const FREELANCER_TABS = [
  { key: "services", label: "My Services" },
  { key: "jobs",     label: "My Jobs"     },
  { key: "rep",      label: "Reputation"  },
];

const CLIENT_TABS = [
  { key: "browse", label: "Browse & Hire" },
  { key: "jobs",   label: "My Jobs"       },
  { key: "rate",   label: "Rate & Review" },
  { key: "rep",    label: "My Reputation" },
];

/* ─── App ──────────────────────────────────────────────────────────── */
const App = () => {
  const [role,         setRole]        = useState("freelancer");
  const [freelancerTab, setFreelancerTab] = useState("services");
  const [clientTab,    setClientTab]   = useState("browse");

  const {
    account,
    provider,
    signer,
    chainId,
    chainOk,
    connecting,
    accountRefreshNeeded,
    refreshAccount,
    connect,
  } = useWallet();
  const { toasts, toast } = useToast();

  const accent = role === "freelancer" ? "#f59e0b" : "#38bdf8";

  // Shared props passed to every page
  const pageProps = { account, provider, signer, toast, chainOk };

  /* ── Client-tab helpers (cross-page navigation) ──────────────────── */
  const goToClientRate = () => setClientTab("rate");
  const goToClientJobs = () => setClientTab("jobs");

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header
        role={role}
        setRole={setRole}
        account={account}
        connect={connect}
        connecting={connecting}
        chainId={chainId}
        accountRefreshNeeded={accountRefreshNeeded}
        refreshAccount={refreshAccount}
      />

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px" }}>

        {/* Demo warning */}
        {/* Not connected → landing */}
        {!account && <Landing connect={connect} connecting={connecting} />}

        {/* ── WRONG NETWORK WARNING ────────────────────────────────── */}
        {account && !chainOk && (
          <Card>
            <div style={{ padding: 20 }}>
              <h2 style={{ marginTop: 0 }}>Wrong network</h2>
              <p>Please switch MetaMask to chain ID {CHAIN_ID} and reconnect.</p>
            </div>
          </Card>
        )}

        {/* ── FREELANCER VIEW ─────────────────────────────────────── */}
        {account && chainOk && role === "freelancer" && (
          <>
            <Tabs
              tabs={FREELANCER_TABS}
              active={freelancerTab}
              onSelect={setFreelancerTab}
              accent={accent}
            />
            {freelancerTab === "services" && <Services   {...pageProps} />}
            {freelancerTab === "jobs"     && <FreelancerJobs {...pageProps} />}
            {freelancerTab === "rep"      && <Reputation  {...pageProps} />}
          </>
        )}

        {/* ── CLIENT VIEW ─────────────────────────────────────────── */}
        {account && chainOk && role === "client" && (
          <>
            <Tabs
              tabs={CLIENT_TABS.map((t) => ({
                ...t,
                // dot on Rate tab when there are unrated jobs
                dot: t.key === "rate" && clientTab !== "rate",
              }))}
              active={clientTab}
              onSelect={setClientTab}
              accent={accent}
            />
            {clientTab === "browse" && (
              <Browse {...pageProps} onHired={goToClientJobs} />
            )}
            {clientTab === "jobs" && (
              <ClientJobs {...pageProps} onRateNeeded={goToClientRate} />
            )}
            {clientTab === "rate" && <Rate {...pageProps} />}
            {clientTab === "rep" && <ClientReputation {...pageProps} />}
          </>
        )}
      </main>

      <ToastList toasts={toasts} />
    </div>
  );
};

export default App;