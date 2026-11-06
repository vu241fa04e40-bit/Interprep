import React, { useState, useEffect, useRef } from "react";
import "./App.css";

export default function App() {
  const [authView, setAuthView] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null"),
  );
  const [isGuest, setIsGuest] = useState(false);

  const [authFormData, setAuthFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [resetData, setResetData] = useState({
    email: "",
    code: "",
    newPassword: "",
  });
  const [authError, setAuthError] = useState(null);
  const [authMessage, setAuthMessage] = useState(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [guestHistory, setGuestHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 4 Core Pillars: Interview Prep & Code Explainer Prioritized
  const [mode, setMode] = useState("interview");
  const [inputText, setInputText] = useState("");
  const [tone, setTone] = useState("Conversational (Interview Spoken)");
  const [customTone, setCustomTone] = useState("");
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeTitle, setActiveTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showDiff, setShowDiff] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editableOutput, setEditableOutput] = useState("");

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    item: null,
  });
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [filterMode, setFilterMode] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  // Dynamic Navigation & Menu States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuPinned, setIsMenuPinned] = useState(false);
  const menuContainerRef = useRef(null);

  // Linguistic Variance & Pattern Heuristics States
  const [initialAiScore, setInitialAiScore] = useState(null);
  const [finalAiScore, setFinalAiScore] = useState(null);
  const [mappedSentences, setMappedSentences] = useState([]);

  useEffect(() => {
    if (isGuest) setHistoryLoaded(true);
  }, [isGuest]);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      setContextMenu({ visible: false, x: 0, y: 0, item: null });
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target)
      ) {
        setIsMenuOpen(false);
        setIsMenuPinned(false);
      }
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  // Debounced Real-Time Pattern Heuristic Scan
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (inputText.trim().length >= 15 && token) {
        try {
          const res = await fetch("https://interprep-zhtu.onrender.com/api/detect-ai", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ text: inputText }),
          });
          if (res.ok) {
            const data = await res.json();
            setInitialAiScore(data.aiScore);
          }
        } catch {
          // Silent fallback on rapid network changes
        }
      } else {
        setInitialAiScore(null);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [inputText, token]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("https://interprep-zhtu.onrender.com/api/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setHistory(await res.json());
    } catch (err) {
      console.error("History load failure:", err);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    const endpoint =
      authView === "register" ? "/api/auth/register" : "/api/auth/login";

    try {
      const res = await fetch(`https://interprep-zhtu.onrender.com${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authFormData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (authView === "register") {
        setAuthMessage("Registration complete! Please log in.");
        setAuthView("login");
      } else {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setIsGuest(false);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch(
        "https://interprep-zhtu.onrender.com/api/auth/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: resetData.email }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthMessage(data.message);
      setAuthView("reset");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch("https://interprep-zhtu.onrender.com/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetData.email,
          code: resetData.code,
          newPassword: resetData.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthMessage("Password reset successfully. Please log in.");
      setAuthView("login");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleHumanize = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setResult(null);
    setIsEditing(false);

    try {
      const payload = {
        text: inputText,
        mode,
        tone,
        customTone,
        threadId: activeThreadId,
      };

      const res = await fetch("https://interprep-zhtu.onrender.com/api/humanize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data);
      setEditableOutput(data.refinedText);
      setActiveThreadId(data.threadId);
      setActiveTitle(data.threadTitle || "Conversation");
      setFinalAiScore(data.aiScore);
      setMappedSentences(data.sentences || []);

      if (isGuest) {
        setGuestHistory([
          {
            id: Date.now(),
            created_at: new Date().toISOString(),
            original_text: inputText,
            refined_text: data.refinedText,
            similarity_score: data.similarityScore,
            passed_threshold: data.similarityScore >= 80,
            threadTitle: data.threadTitle || "Conversation",
            thread_id: data.threadId,
            mode,
          },
          ...guestHistory,
        ]);
      } else {
        fetchHistory();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isGuest)
      return alert(
        "Guest accounts cannot persist personalized learning weights.",
      );
    try {
      const res = await fetch("https://interprep-zhtu.onrender.com/api/feedback/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          originalText: inputText,
          editedText: editableOutput,
        }),
      });
      if (!res.ok) throw new Error("Failed to persist edit");
      setIsEditing(false);
      setResult({ ...result, refinedText: editableOutput });
      alert(
        "Personalization saved! The linguistic model will adopt this phrasing.",
      );
    } catch (err) {
      alert(err.message);
    }
  };

  const handleNewChat = () => {
    setInputText("");
    setResult(null);
    setCustomTone("");
    setActiveThreadId(null);
    setActiveTitle("");
    setIsEditing(false);
    setEditableOutput("");
    setShowDiff(false);
    setInitialAiScore(null);
    setFinalAiScore(null);
    setMappedSentences([]);
  };

  const handleRenameActive = async () => {
    if (activeThreadId && !isGuest && activeTitle.trim()) {
      await fetch(
        `https://interprep-zhtu.onrender.com/api/threads/${activeThreadId}/rename`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: activeTitle }),
        },
      );
      fetchHistory();
    }
  };

  const handleDeleteActiveChat = async () => {
    if (activeThreadId && !isGuest) {
      await fetch(`https://interprep-zhtu.onrender.com/api/threads/${activeThreadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchHistory();
    }
    handleNewChat();
  };

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.pageX, y: e.pageY, item });
  };

  const handleContextMenuRename = async (item) => {
    const newName = prompt(
      "Enter updated conversation label:",
      item.threadTitle,
    );
    if (newName && newName.trim() !== "") {
      if (isGuest) {
        setGuestHistory(
          guestHistory.map((h) =>
            h.id === item.id ? { ...h, threadTitle: newName } : h,
          ),
        );
      } else {
        await fetch(
          `https://interprep-zhtu.onrender.com/api/threads/${item.thread_id}/rename`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ title: newName }),
          },
        );
        fetchHistory();
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, item: null });
  };

  const handleDeleteHistory = async (id) => {
    if (isGuest)
      return setGuestHistory(guestHistory.filter((item) => item.id !== id));
    try {
      await fetch(`https://interprep-zhtu.onrender.com/api/history/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const activeHistory = isGuest ? guestHistory : history;
  const filteredHistory = activeHistory.filter((item) => {
    const matchesSearch = (item.threadTitle || item.original_text || "")
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesMode = filterMode === "all" || item.mode === filterMode;
    let matchesDate = true;
    if (filterDate) {
      if (!item.created_at) matchesDate = false;
      else {
        const parsed = new Date(item.created_at);
        matchesDate =
          !isNaN(parsed.getTime()) &&
          parsed.toISOString().split("T")[0] === filterDate;
      }
    }
    return matchesSearch && matchesMode && matchesDate;
  });

  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <h2>
            {authView === "login"
              ? "Sign In to Interprep"
              : authView === "register"
                ? "Create Professional Account"
                : "Reset Credentials"}
          </h2>
          {authError && <div className="auth-error-banner">{authError}</div>}
          {authMessage && (
            <div className="auth-success-banner">{authMessage}</div>
          )}

          {authView === "login" && (
            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Username / Email</label>
                <input
                  type="text"
                  required
                  placeholder="Enter credentials"
                  value={authFormData.username}
                  onChange={(e) =>
                    setAuthFormData({
                      ...authFormData,
                      username: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  placeholder="Enter security key"
                  value={authFormData.password}
                  onChange={(e) =>
                    setAuthFormData({
                      ...authFormData,
                      password: e.target.value,
                    })
                  }
                />
              </div>
              <button type="submit" className="primary-btn full-btn">
                Authenticate
              </button>
              <button
                type="button"
                className="secondary-btn full-btn mt-10"
                onClick={() => {
                  setIsGuest(true);
                  setToken("guest_session");
                }}
              >
                Explore as Guest
              </button>
              <div className="auth-links">
                <span onClick={() => setAuthView("register")}>
                  Create an account
                </span>
                <span onClick={() => setAuthView("forgot")}>
                  Forgot password?
                </span>
              </div>
            </form>
          )}

          {authView === "register" && (
            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  required
                  placeholder="Choose handle"
                  value={authFormData.username}
                  onChange={(e) =>
                    setAuthFormData({
                      ...authFormData,
                      username: e.target.value,
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Corporate / Student Email</label>
                <input
                  type="email"
                  required
                  placeholder="name@institution.edu"
                  value={authFormData.email}
                  onChange={(e) =>
                    setAuthFormData({ ...authFormData, email: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Security Key</label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={authFormData.password}
                  onChange={(e) =>
                    setAuthFormData({
                      ...authFormData,
                      password: e.target.value,
                    })
                  }
                />
              </div>
              <button type="submit" className="primary-btn full-btn">
                Register Account
              </button>
              <div className="auth-links center">
                <span onClick={() => setAuthView("login")}>
                  Return to Sign In
                </span>
              </div>
            </form>
          )}

          {authView === "forgot" && (
            <form onSubmit={handleForgotPassword}>
              <p className="auth-subtitle">
                Provide your email address to receive a secure 6-digit recovery code.
              </p>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="Enter registered email"
                  value={resetData.email}
                  onChange={(e) =>
                    setResetData({ ...resetData, email: e.target.value })
                  }
                />
              </div>
              <button type="submit" className="primary-btn full-btn">
                Send Recovery Code
              </button>
              <div className="auth-links center">
                <span onClick={() => setAuthView("login")}>Cancel</span>
              </div>
            </form>
          )}

          {authView === "reset" && (
            <form onSubmit={handleResetPassword}>
              <p className="auth-subtitle text-gray-700">
                The code is sent to <span className="font-bold">{resetData.email}</span>. Please check for the code.
              </p>
              
              <div className="form-group">
                <label>Verification Code</label>
                <input
                  type="text"
                  required
                  placeholder="6-digit PIN"
                  value={resetData.code}
                  onChange={(e) =>
                    setResetData({ ...resetData, code: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>New Security Key</label>
                <input
                  type="password"
                  required
                  placeholder="Enter updated password"
                  value={resetData.newPassword}
                  onChange={(e) =>
                    setResetData({ ...resetData, newPassword: e.target.value })
                  }
                />
              </div>
              <button type="submit" className="primary-btn full-btn mb-3">
                Confirm Reset
              </button>

              <div className="auth-links center">
                <span 
                  onClick={() => setAuthView("forgot")}
                  style={{ textDecoration: 'underline', cursor: 'pointer', fontSize: '14px', color: '#666' }}
                >
                  Wrong email? Go back and change it
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-container">
      <header className="top-navbar">
        <div className="active-chat-header">
          <div
            className="hamburger-container"
            ref={menuContainerRef}
            onMouseEnter={() => setIsMenuOpen(true)}
            onMouseLeave={() => {
              if (!isMenuPinned) setIsMenuOpen(false);
            }}
          >
            <button
              className={`circular-hamburger ${isMenuPinned ? "pinned" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuPinned((prev) => !prev);
                setIsMenuOpen(true);
              }}
              title="Navigation Menu"
            >
              <span className="line"></span>
              <span className="line"></span>
              <span className="line"></span>
            </button>

            {isMenuOpen && (
              <div className="hamburger-dropdown">
                <button
                  onClick={() => {
                    handleNewChat();
                    setIsMenuOpen(false);
                    setIsMenuPinned(false);
                  }}
                >
                  ➕ New Session
                </button>
                <button
                  onClick={() => {
                    setIsSidebarOpen(!isSidebarOpen);
                    setIsMenuOpen(false);
                    setIsMenuPinned(false);
                  }}
                >
                  📜 History Vault
                </button>
                <hr />
                <button
                  className="logout-opt"
                  onClick={() => {
                    localStorage.clear();
                    setToken(null);
                    setUser(null);
                    setIsGuest(false);
                  }}
                >
                  🚪 Log Out
                </button>
              </div>
            )}
          </div>

          <h2 className="welcome-banner">
            Interprep Workspace: {isGuest ? "Guest" : user?.username}
          </h2>

          <input
            type="text"
            className="active-title-input"
            value={activeTitle}
            onChange={(e) => setActiveTitle(e.target.value)}
            onBlur={handleRenameActive}
            placeholder="New Conversation"
          />
        </div>

        <div className="nav-controls">
          {initialAiScore !== null && (
            <div
              className="initial-detection-badge"
              title="Algorithmic pattern risk based on burstiness & transition markers"
            >
              Input Pattern Risk:{" "}
              <span
                className={initialAiScore > 50 ? "danger-text" : "safe-text"}
              >
                {initialAiScore}%
              </span>
            </div>
          )}

          {(activeThreadId || inputText) && (
            <button
              className="nav-btn delete-nav-top"
              onClick={handleDeleteActiveChat}
              title="Clear workspace"
            >
              🗑 Delete Session
            </button>
          )}
        </div>
      </header>

      <div className="layout-body">
        <aside className={`history-sidebar ${!isSidebarOpen ? "closed" : ""}`}>
          <div className="sidebar-header">
            <input
              type="text"
              className="history-search"
              placeholder="Search archive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <input
              type="date"
              className="history-date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              title="Filter by Date"
            />
            <button
              className="close-sidebar-btn"
              onClick={() => setIsSidebarOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="sidebar-filters">
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
            >
              <option value="all">All Disciplines</option>
              <option value="interview">🎯 Interview Preparation</option>
              <option value="code_explainer">💻 Code Explainer</option>
              <option value="general">📝 General Refinement</option>
              <option value="anti_plagiarism">
                🎭 Stylistic Flow & Burstiness
              </option>
            </select>
          </div>

          <div className="history-list">
            {!historyLoaded ? (
              <div className="empty-msg">
                <button
                  className="primary-btn"
                  onClick={() => {
                    fetchHistory();
                    setHistoryLoaded(true);
                  }}
                >
                  Load Historical Logs
                </button>
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="empty-msg">No historical sessions found.</p>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="history-card"
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onClick={() => {
                    setInputText(item.original_text);
                    setMode(item.mode || "interview");
                    setResult({
                      refinedText: item.refined_text,
                      similarityScore: item.similarity_score,
                      passedThreshold: item.passed_threshold,
                    });
                    setEditableOutput(item.refined_text);
                    setActiveThreadId(item.thread_id || null);
                    setActiveTitle(item.threadTitle || "Conversation");
                  }}
                >
                  <div className="history-card-header">
                    <span className="style-tag">
                      {item.threadTitle || "Conversation"}
                    </span>
                    <span
                      className={`score-badge-mini ${item.passed_threshold ? "pass" : "fail"}`}
                    >
                      {item.similarity_score}%
                    </span>
                  </div>
                  <div className="history-card-date">
                    {item.created_at &&
                    !isNaN(new Date(item.created_at).getTime())
                      ? new Date(item.created_at).toLocaleString([], {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "Just now"}
                  </div>
                  <p className="history-card-snippet">
                    {item.original_text.substring(0, 48)}...
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="main-workspace">
          {/* Prioritized 4 Pillars */}
          <div className="mode-toggle-bar">
            <button
              className={`mode-btn ${mode === "interview" ? "active" : ""}`}
              onClick={() => {
                setMode("interview");
                setTone("Conversational (Interview Spoken)");
              }}
            >
              🎯 Interview Preparation
            </button>
            <button
              className={`mode-btn ${mode === "code_explainer" ? "active" : ""}`}
              onClick={() => {
                setMode("code_explainer");
                setTone("Line-by-Line Workflow Trace");
              }}
            >
              💻 Code Explainer
            </button>
            <button
              className={`mode-btn ${mode === "general" ? "active" : ""}`}
              onClick={() => {
                setMode("general");
                setTone("Executive Brief");
              }}
            >
              📝 General Refinement
            </button>
            <button
              className={`mode-btn ${mode === "anti_plagiarism" ? "active" : ""}`}
              onClick={() => {
                setMode("anti_plagiarism");
                setTone("High Burstiness (Pattern Dissolution)");
              }}
            >
              🎭 Stylistic Flow & Burstiness
            </button>
          </div>

          <section className="input-box-wrapper">
            <label className="field-label">
              {mode === "interview"
                ? "Original Technical Subject Matter (Candidate Draft)"
                : mode === "code_explainer"
                  ? "Raw Code (C++, Python, JS, Go, SQL)"
                  : mode === "general"
                    ? "Original Draft Document"
                    : "Monotonous / Formulaic Text (Pattern Analysis)"}
            </label>
            <textarea
              className="styled-textarea"
              placeholder={
                mode === "code_explainer"
                  ? "Paste code snippet here for workflow & complexity evaluation..."
                  : "Paste text content here..."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </section>

          <section className="control-strip">
            <div className="tone-selector-group">
              <select
                className="select-dropdown"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                {mode === "interview" ? (
                  <>
                    <option value="Conversational (Interview Spoken)">
                      Conversational (Interview Spoken)
                    </option>
                    <option value="STAR Behavioral Answer">
                      STAR Behavioral Answer (Situation/Task/Action/Result)
                    </option>
                    <option value="Senior Staff Engineer Technical Pitch">
                      Senior Staff Engineer Technical Pitch
                    </option>
                  </>
                ) : mode === "code_explainer" ? (
                  <>
                    <option value="Line-by-Line Workflow Trace">
                      Line-by-Line Workflow Trace
                    </option>
                    <option value="Interview Code Walkthrough">
                      Interview Code Walkthrough (Dry Run)
                    </option>
                    <option value="Time & Space Complexity (Big-O Evaluation)">
                      Time & Space Complexity (Big-O Evaluation)
                    </option>
                    <option value="Simple and clear">
                      Simple and clear
                    </option>
                  </>
                ) : mode === "general" ? (
                  <>
                    <option value="Executive Brief">Executive Brief</option>
                    <option value="Academic Paraphrase">
                      Academic Paraphrase
                    </option>
                    <option value="Plain English (High Readability)">
                      Plain English (High Readability)
                    </option>
                  </>
                ) : (
                  <>
                    <option value="High Burstiness (Pattern Dissolution)">
                      High Burstiness (Pattern Dissolution)
                    </option>
                    <option value="Conversational Cadence">
                      Conversational Cadence
                    </option>
                    <option value="Organic Literary Variance">
                      Organic Literary Variance
                    </option>
                  </>
                )}
              </select>
              <input
                type="text"
                className="custom-tone-input"
                placeholder="Or custom directive..."
                value={customTone}
                onChange={(e) => setCustomTone(e.target.value)}
              />
            </div>

            <button
              className="primary-btn generate-btn"
              onClick={handleHumanize}
              disabled={loading}
            >
              {loading
                ? "Synthesizing..."
                : mode === "code_explainer"
                  ? "Trace Architecture"
                  : mode === "anti_plagiarism"
                    ? "Enhance Burstiness"
                    : "Synthesize Text"}
            </button>
          </section>

          <section className="output-box-wrapper">
            <div className="output-header-bar">
              <label className="field-label">Evaluated Output</label>
              {result && (
                <div className="metrics-chip-container">
                  <span
                    className={`score-badge ${result.similarityScore >= 80 ? "pass" : "fail"}`}
                    title="Entity retention & vocabulary preservation"
                  >
                    Semantic Retention: {result.similarityScore}%
                  </span>

                  {finalAiScore !== null && (
                    <span
                      className={`score-badge ${finalAiScore < 35 ? "pass" : "fail"}`}
                      title="Sentence length variance & algorithmic marker heuristic"
                    >
                      Pattern Heuristic Risk: {finalAiScore}%
                    </span>
                  )}

                  {!isGuest && (
                    <button
                      className="chip-btn edit-chip"
                      onClick={
                        isEditing ? handleSaveEdit : () => setIsEditing(true)
                      }
                    >
                      {isEditing
                        ? "💾 Persist Personalized Style"
                        : "✏️ Fine-Tune Output"}
                    </button>
                  )}

                  <button
                    className="chip-btn"
                    onClick={() => setShowDiff(!showDiff)}
                  >
                    {showDiff
                      ? "Standard View"
                      : mode === "anti_plagiarism"
                        ? "Sentence Burstiness Map"
                        : "Inspect Semantic Diff"}
                  </button>
                </div>
              )}
            </div>

            <div className="output-viewport">
              {loading ? (
                <div className="loading-state">
                  Synthesizing linguistic structure, evaluating burstiness
                  metrics, and applying personalized weight adjustments...
                </div>
              ) : !result ? (
                <div className="placeholder-state">
                  Refined analysis and synthesis will appear in this workspace.
                </div>
              ) : isEditing ? (
                <textarea
                  className="styled-textarea full-height"
                  value={editableOutput}
                  onChange={(e) => setEditableOutput(e.target.value)}
                />
              ) : mode === "anti_plagiarism" && showDiff ? (
                <div className="sentence-map-view">
                  <div className="map-legend">
                    <span className="legend-chip low">
                      ■ High Burstiness (Organic Variance)
                    </span>
                    <span className="legend-chip medium">
                      ■ Moderate Pattern
                    </span>
                    <span className="legend-chip high">
                      ■ Formulaic / Monotonous Structure
                    </span>
                  </div>
                  <div className="mapped-text-body">
                    {mappedSentences.map((s, i) => (
                      <span
                        key={i}
                        className={`sentence-span ${s.category}`}
                        title={`Calculated Pattern Score: ${s.score}%`}
                      >
                        {s.text}{" "}
                      </span>
                    ))}
                  </div>
                </div>
              ) : showDiff && result.diff ? (
                <div className="diff-view">
                  {result.diff.map((chunk, i) => (
                    <span
                      key={i}
                      className={
                        chunk.added
                          ? "diff-added"
                          : chunk.removed
                            ? "diff-removed"
                            : ""
                      }
                    >
                      {chunk.value}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="output-text-content">{editableOutput}</div>
              )}
            </div>
          </section>
        </main>
      </div>

      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div
            onClick={() =>
              navigator.clipboard.writeText(contextMenu.item.refined_text)
            }
          >
            📋 Copy Content
          </div>
          <div onClick={() => handleContextMenuRename(contextMenu.item)}>
            ✏️ Rename Thread
          </div>
          <div
            className="delete-opt"
            onClick={() => handleDeleteHistory(contextMenu.item.id)}
          >
            🗑 Remove Log
          </div>
        </div>
      )}
    </div>
  );
}
