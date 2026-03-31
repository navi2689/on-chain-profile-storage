"use client";

import { useState, useRef, useCallback } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { isConnected, isAllowed, setAllowed, getPublicKey, signTransaction } from "@stellar/freighter-api";

const TESTNET_RPC = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

export default function Home() {
  // Connection state
  const [contractId, setContractId] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSetupVisible, setIsSetupVisible] = useState(true);
  const [isMainVisible, setIsMainVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({ message: "", type: "" });
  const [connecting, setConnecting] = useState(false);

  // Profile form state
  const [nameInput, setNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ message: "", type: "" });

  // Profile display state
  const [displayName, setDisplayName] = useState("Not Found");
  const [displayBio, setDisplayBio] = useState("No profile data available.");
  const [avatarInitials, setAvatarInitials] = useState("?");
  const [refreshing, setRefreshing] = useState(false);

  // Search state
  const [searchAddress, setSearchAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchName, setSearchName] = useState("Not Found");
  const [searchBio, setSearchBio] = useState("No profile data available.");
  const [searchAvatar, setSearchAvatar] = useState("?");
  const [searchStatus, setSearchStatus] = useState({ message: "", type: "" });

  // Refs
  const demoProfileRef = useRef({ name: "Demo User", bio: "This is a local demo profile for testing UI." });
  const serverRef = useRef(null);
  const contractIdRef = useRef("");

  // Helper: set status with auto-clear for success
  const showStatus = useCallback((setter, message, type) => {
    setter({ message, type });
    if (type === "success") {
      setTimeout(() => {
        setter((prev) => (prev.message === message ? { message: "", type: "" } : prev));
      }, 4000);
    }
  }, []);

  // Initialize Stellar RPC server
  const initStellar = useCallback(() => {
    serverRef.current = new StellarSdk.rpc.Server(TESTNET_RPC);
  }, []);

  // Update profile display helper
  const updateProfileUI = useCallback((name, bio) => {
    setDisplayName(name);
    setDisplayBio(bio);
    if (name && name !== "Unknown" && name !== "Error") {
      setAvatarInitials(name.substring(0, 2).toUpperCase());
    } else {
      setAvatarInitials("?");
    }
  }, []);

  // Update search display helper
  const updateSearchUI = useCallback((name, bio) => {
    setSearchVisible(true);
    setSearchName(name);
    setSearchBio(bio);
    if (name && name !== "Unknown" && name !== "Error" && name !== "Not Found") {
      setSearchAvatar(name.substring(0, 2).toUpperCase());
    } else {
      setSearchAvatar("?");
    }
    setSearchStatus({ message: "", type: "" });
  }, []);

  // Fetch profile (read-only)
  const fetchProfile = useCallback(
    async (demo, address) => {
      setRefreshing(true);

      if (demo) {
        setTimeout(() => {
          updateProfileUI(demoProfileRef.current.name, demoProfileRef.current.bio);
          setRefreshing(false);
        }, 800);
        return;
      }

      try {
        const contract = new StellarSdk.Contract(contractIdRef.current);
        const args = [StellarSdk.nativeToScVal(address, { type: "address" })];
        const account = new StellarSdk.Account(address, "0");

        const tx = new StellarSdk.TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(contract.call("get_profile", ...args))
          .setTimeout(30)
          .build();

        const simRes = await serverRef.current.simulateTransaction(tx);

        if (StellarSdk.rpc.Api.isSimulationSuccess(simRes) && simRes.result) {
          const nativeTuple = StellarSdk.scValToNative(simRes.result.retval);
          if (Array.isArray(nativeTuple) && nativeTuple.length === 2) {
            updateProfileUI(nativeTuple[0], nativeTuple[1]);
          } else {
            updateProfileUI("Unknown", "Profile format unexpected.");
          }
        } else {
          updateProfileUI("Unknown", "No profile found or error.");
        }
      } catch (err) {
        console.error(err);
        updateProfileUI("Error", "Could not fetch profile.");
      } finally {
        setRefreshing(false);
      }
    },
    [updateProfileUI]
  );

  // Connect wallet
  const handleConnect = async () => {
    const cid = contractId.trim();
    if (!cid) {
      showStatus(setConnectionStatus, "Please enter a Contract ID.", "error");
      return;
    }

    // DEMO MODE
    if (cid.toLowerCase() === "demo") {
      setIsDemoMode(true);
      setUserAddress("DEMO_WALLET_ADDR");
      showStatus(setConnectionStatus, "Connected in DEMO mode.", "success");
      contractIdRef.current = cid;

      setTimeout(() => {
        setIsSetupVisible(false);
        setIsMainVisible(true);
        fetchProfile(true, "DEMO_WALLET_ADDR");
      }, 1000);
      return;
    }

    // REAL CONTRACT
    setIsDemoMode(false);
    initStellar();
    setConnecting(true);
    showStatus(setConnectionStatus, "Connecting to Freighter...", "");

    try {
      if (typeof window === "undefined") throw new Error("Window not available");

      const connected = await isConnected();
      if (!connected) throw new Error("Please install and unlock Freighter!");

      const allowed = await isAllowed();
      if (!allowed) await setAllowed();

      const pubKey = await getPublicKey();
      setUserAddress(pubKey);
      contractIdRef.current = cid;

      showStatus(
        setConnectionStatus,
        `Connected: ${pubKey.substring(0, 6)}...${pubKey.slice(-4)}`,
        "success"
      );

      setTimeout(() => {
        setIsSetupVisible(false);
        setIsMainVisible(true);
        fetchProfile(false, pubKey);
      }, 1500);
    } catch (err) {
      showStatus(setConnectionStatus, err.message || "Failed to connect wallet", "error");
      setConnecting(false);
    }
  };

  // Save profile
  const handleSave = async (e) => {
    e.preventDefault();
    const name = nameInput.trim();
    const bio = bioInput.trim();
    if (!name || !bio) return;

    setSaving(true);
    showStatus(setSaveStatus, "Saving to blockchain...", "");

    if (isDemoMode) {
      setTimeout(() => {
        demoProfileRef.current = { name, bio };
        setSaving(false);
        showStatus(setSaveStatus, "Profile saved successfully!", "success");
        setNameInput("");
        setBioInput("");
        fetchProfile(true, userAddress);
      }, 1500);
      return;
    }

    try {
      const contract = new StellarSdk.Contract(contractIdRef.current);
      const account = await serverRef.current.getAccount(userAddress);

      const args = [
        StellarSdk.nativeToScVal(userAddress, { type: "address" }),
        StellarSdk.nativeToScVal(name, { type: "string" }),
        StellarSdk.nativeToScVal(bio, { type: "string" }),
      ];

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call("set_profile", ...args))
        .setTimeout(30)
        .build();

      showStatus(setSaveStatus, "Simulating transaction...", "");
      const simRes = await serverRef.current.simulateTransaction(tx);

      if (StellarSdk.rpc.Api.isSimulationError(simRes)) {
        throw new Error("Simulation failed. Check contract ID and network.");
      }

      const assembledTx = StellarSdk.assembleTransaction(tx, simRes).build();

      showStatus(setSaveStatus, "Please sign transaction in Freighter...", "");
      const signedXdr = await signTransaction(assembledTx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      showStatus(setSaveStatus, "Submitting to network...", "");
      const sendRes = await serverRef.current.sendTransaction(signedTx);

      if (sendRes.status === "PENDING") {
        let getTxRes = await serverRef.current.getTransaction(sendRes.hash);
        let attempts = 0;
        while (getTxRes.status === "NOT_FOUND" && attempts < 10) {
          await new Promise((r) => setTimeout(r, 2000));
          getTxRes = await serverRef.current.getTransaction(sendRes.hash);
          attempts++;
        }
        if (getTxRes.status === "SUCCESS") {
          showStatus(setSaveStatus, "Profile saved to blockchain!", "success");
          setNameInput("");
          setBioInput("");
          fetchProfile(false, userAddress);
        } else {
          throw new Error("Transaction failed on network.");
        }
      } else {
        throw new Error("Failed to submit transaction.");
      }
    } catch (err) {
      showStatus(setSaveStatus, err.message || "Failed to save profile", "error");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Search profile
  const handleSearch = async () => {
    const targetAddr = searchAddress.trim();
    if (!targetAddr) return;

    setSearching(true);
    setSearchStatus({ message: "Searching blockchain...", type: "" });
    setSearchVisible(false);

    if (isDemoMode) {
      setTimeout(() => {
        if (targetAddr.toLowerCase() === "demo") {
          updateSearchUI(demoProfileRef.current.name, demoProfileRef.current.bio);
        } else {
          updateSearchUI("Not Found", "No profile exists for this address in demo mode.");
        }
        setSearching(false);
      }, 800);
      return;
    }

    try {
      const contract = new StellarSdk.Contract(contractIdRef.current);
      const args = [StellarSdk.nativeToScVal(targetAddr, { type: "address" })];

      let accountObj;
      try {
        accountObj = new StellarSdk.Account(targetAddr, "0");
      } catch {
        throw new Error("Invalid format for Stellar Address (G...)");
      }

      const tx = new StellarSdk.TransactionBuilder(accountObj, {
        fee: "100",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call("get_profile", ...args))
        .setTimeout(30)
        .build();

      const simRes = await serverRef.current.simulateTransaction(tx);

      if (StellarSdk.rpc.Api.isSimulationSuccess(simRes) && simRes.result) {
        const nativeTuple = StellarSdk.scValToNative(simRes.result.retval);
        if (Array.isArray(nativeTuple) && nativeTuple.length === 2) {
          updateSearchUI(nativeTuple[0], nativeTuple[1]);
        } else {
          updateSearchUI("Unknown", "Profile format unexpected.");
        }
      } else {
        updateSearchUI("Not Found", "No profile data available for this address.");
      }
    } catch (err) {
      console.error(err);
      updateSearchUI("Error", err.message || "Invalid address or network error.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>On-Chain Profile</h1>
        <p className="subtitle">Store your identity on the Stellar blockchain</p>
      </header>

      <main>
        {/* Setup & Connect Section */}
        {isSetupVisible && (
          <section className="card setup-section fade-in" id="setup-section">
            <h2>Network Setup</h2>
            <div className="input-group">
              <label htmlFor="contractId">Contract ID</label>
              <input
                type="text"
                id="contractId"
                placeholder="C..."
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
              />
            </div>
            <div className="demo-note">
              Use &quot;demo&quot; as Contract ID to simulate locally, or enter a real ID.
            </div>
            <button
              id="connectBtn"
              className="primary-btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Connect with Freighter Wallet"}
            </button>
            <div
              id="connectionStatus"
              className={`status-message ${connectionStatus.type}`}
            >
              {connectionStatus.message}
            </div>
          </section>
        )}

        {/* Main App Content */}
        {isMainVisible && (
          <>
            <div className="grid-layout fade-in" id="mainAppContent">
              {/* Update Profile Section */}
              <section className="card edit-section fade-in-delay-1">
                <h2>Update Profile</h2>
                <form id="profileForm" onSubmit={handleSave}>
                  <div className="input-group">
                    <label htmlFor="nameInput">Name</label>
                    <input
                      type="text"
                      id="nameInput"
                      placeholder="e.g. Satoshi"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="bioInput">Bio</label>
                    <textarea
                      id="bioInput"
                      rows={4}
                      placeholder="Tell us about yourself..."
                      required
                      value={bioInput}
                      onChange={(e) => setBioInput(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="primary-btn submit-btn"
                    id="saveBtn"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save to Blockchain"}
                    {saving && <span className="loader" />}
                  </button>
                </form>
                <div
                  id="saveStatus"
                  className={`status-message ${saveStatus.type}`}
                >
                  {saveStatus.message}
                </div>
              </section>

              {/* View Profile Section */}
              <section className="card view-section fade-in-delay-2">
                <h2>My Profile</h2>
                <div className="profile-card">
                  <div className="avatar-placeholder" id="avatarInitials">
                    {avatarInitials}
                  </div>
                  <div className="profile-details">
                    <h3 id="displayName">{displayName}</h3>
                    <p id="displayBio" className="bio-text">
                      {displayBio}
                    </p>
                  </div>
                </div>
                <button
                  id="refreshBtn"
                  className="secondary-btn mt-4"
                  onClick={() => fetchProfile(isDemoMode, userAddress)}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing..." : "Refresh Profile"}
                  {refreshing && <span className="loader" />}
                </button>
              </section>
            </div>

            {/* Search Profile Section */}
            <section className="card search-section fade-in-delay-2" id="searchAppContent">
              <h2>Find an On-Chain Profile</h2>
              <div className="search-group">
                <input
                  type="text"
                  id="searchAddressInput"
                  placeholder="Enter Stellar Address (G...)"
                  value={searchAddress}
                  onChange={(e) => setSearchAddress(e.target.value)}
                />
                <button
                  id="searchBtn"
                  className="primary-btn"
                  onClick={handleSearch}
                  disabled={searching}
                >
                  {searching ? "..." : "Search"}
                </button>
              </div>
              {searchVisible && (
                <div id="searchResult" className="profile-card mt-4 fade-in">
                  <div className="avatar-placeholder" id="searchAvatar">
                    {searchAvatar}
                  </div>
                  <div className="profile-details">
                    <h3 id="searchDisplayName">{searchName}</h3>
                    <p id="searchDisplayBio" className="bio-text">
                      {searchBio}
                    </p>
                  </div>
                </div>
              )}
              <div
                id="searchStatus"
                className={`status-message ${searchStatus.type}`}
              >
                {searchStatus.message}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
