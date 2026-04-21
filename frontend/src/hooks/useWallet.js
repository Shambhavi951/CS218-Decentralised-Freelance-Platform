

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CHAIN_ID } from "../constants/config";

const normalizeChainId = (chainId) => {
  if (typeof chainId === "string") {
    return chainId.startsWith("0x") ? Number(chainId) : Number(chainId);
  }
  return Number(chainId);
};

const parseChainStatus = (chainId) => {
  const numeric = normalizeChainId(chainId);
  return {
    numeric,
    ok: numeric === CHAIN_ID,
  };
};

const switchToRequiredChain = async () => {
  if (!window.ethereum) return false;
  const hexChain = `0x${CHAIN_ID.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChain }],
    });
    return true;
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChain,
            chainName: "Hardhat Localhost",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          },
        ],
      });
      return true;
    }
    throw error;
  }
};

/**
 * Wallet + Contract Hook (Ethers v6)
 */
export const useWallet = () => {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [chainOk, setChainOk] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [accountRefreshNeeded, setAccountRefreshNeeded] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    const restoreConnection = async () => {
      try {
        const network = await browserProvider.getNetwork();
        setChainId(network.chainId);
        const onCorrectChain = Number(network.chainId) === CHAIN_ID;
        setChainOk(onCorrectChain);

        const accounts = await browserProvider.send("eth_accounts", []);
        if (accounts.length > 0 && onCorrectChain) {
          const signerInstance = await browserProvider.getSigner();
          setSigner(signerInstance);
          setAccount(accounts[0]);
        } else if (!onCorrectChain) {
          setSigner(null);
          setAccount(null);
        }
      } catch (err) {
        console.error("Wallet restore failed:", err);
      }
    };

    restoreConnection();

    const handleAccountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null);
        setSigner(null);
        setAccountRefreshNeeded(false);
        return;
      }

      if (accounts[0]?.toLowerCase() !== account?.toLowerCase()) {
        setAccountRefreshNeeded(true);
      }

      try {
        const chainHex = await browserProvider.send("eth_chainId", []);
        const { numeric, ok } = parseChainStatus(chainHex);
        setChainId(numeric);
        setChainOk(ok);

        if (!ok) {
          setAccount(null);
          setSigner(null);
          setAccountRefreshNeeded(false);
          return;
        }

        const signerInstance = await browserProvider.getSigner();
        const address = await signerInstance.getAddress();
        setSigner(signerInstance);
        setAccount(address);
        setAccountRefreshNeeded(false);
      } catch (err) {
        console.error("Failed to update account after account change:", err);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      const chainHex = await browserProvider.send("eth_chainId", []);
      const { numeric, ok } = parseChainStatus(chainHex);
      setChainId(numeric);
      setChainOk(ok);

      if (!ok) {
        setAccount(null);
        setSigner(null);
        setAccountRefreshNeeded(false);
        return;
      }

      const signerInstance = await browserProvider.getSigner();
      const address = await signerInstance.getAddress();
      setSigner(signerInstance);
      setAccount(address);
      setAccountRefreshNeeded(false);
    } catch (err) {
      console.error("Failed to refresh account:", err);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    setConnecting(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);
      await browserProvider.send("eth_requestAccounts", []);

      const chainHex = await browserProvider.send("eth_chainId", []);
      const { numeric, ok } = parseChainStatus(chainHex);
      setChainId(numeric);
      setChainOk(ok);

      if (!ok) {
        try {
          await switchToRequiredChain();
          const switchedChainHex = await browserProvider.send("eth_chainId", []);
          const switchedStatus = parseChainStatus(switchedChainHex);
          setChainId(switchedStatus.numeric);
          setChainOk(switchedStatus.ok);
          if (!switchedStatus.ok) {
            alert(`Wrong network. Switch to chainId ${CHAIN_ID}`);
            setConnecting(false);
            return;
          }
        } catch (switchError) {
          console.error("Network switch failed:", switchError);
          alert(`Wrong network. Switch to chainId ${CHAIN_ID}`);
          setConnecting(false);
          return;
        }
      }

      const signerInstance =await browserProvider.getSigner();
      const address = await signerInstance.getAddress();
      setSigner(signerInstance);
      setAccount(address);
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
    setConnecting(false);
  }, []);

  return {
    account,
    provider,
    signer,
    chainId,
    chainOk,
    connecting,
    accountRefreshNeeded,
    connect,
    refreshAccount,
  };
};