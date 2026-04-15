import { useState, useEffect } from "react";
import snsLogo from "./sns_logo.png";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Load brand fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Hind+Madurai:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        localStorage.setItem("sns_token", data.token);
        localStorage.setItem("sns_user", JSON.stringify(data.user));
        onLogin(data.user, data.token);
      }
    } catch {
      setError("Cannot connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const s = {
    page: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0A3E62 0%, #072d46 60%, #041e30 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Montserrat', sans-serif",
      position: "relative",
      overflow: "hidden",
    },
    // Decorative diagonal slash (brand motif)
    slash1: {
      position: "absolute", top: "-10%", right: "15%",
      width: 2, height: "60%",
      background: "rgba(8,143,196,0.12)",
      transform: "rotate(-18deg)", pointerEvents: "none",
    },
    slash2: {
      position: "absolute", bottom: "-10%", left: "20%",
      width: 1, height: "50%",
      background: "rgba(169,213,234,0.08)",
      transform: "rotate(-18deg)", pointerEvents: "none",
    },
    card: {
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderTop: "3px solid #088FC4",
      borderRadius: 4,
      padding: "48px 44px 44px",
      width: "100%",
      maxWidth: 420,
      backdropFilter: "blur(12px)",
      boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
      position: "relative",
      zIndex: 1,
    },
    logoWrap: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 36,
    },
    logo: { height: 44, filter: "brightness(0) invert(1)", opacity: 0.9 },
    divider: {
      width: 1, height: 36,
      background: "rgba(255,255,255,0.15)",
      margin: "0 4px",
    },
    brandText: {
      fontFamily: "'Montserrat', sans-serif",
      fontWeight: 700,
      fontSize: 15,
      color: "#fff",
      letterSpacing: 0.5,
      lineHeight: 1.3,
    },
    brandSub: {
      fontFamily: "'Hind Madurai', sans-serif",
      fontSize: 11,
      color: "rgba(255,255,255,0.45)",
      fontWeight: 400,
      letterSpacing: 0.3,
    },
    heading: {
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 22,
      fontWeight: 700,
      color: "#fff",
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    subheading: {
      fontFamily: "'Hind Madurai', sans-serif",
      fontSize: 13,
      color: "rgba(255,255,255,0.45)",
      marginBottom: 32,
      fontWeight: 400,
    },
    label: {
      display: "block",
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 10,
      fontWeight: 600,
      color: "rgba(255,255,255,0.45)",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    inputWrap: { position: "relative", marginBottom: 20 },
    input: {
      width: "100%",
      padding: "12px 14px",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 3,
      color: "#fff",
      fontSize: 14,
      fontFamily: "'Hind Madurai', sans-serif",
      outline: "none",
      transition: "border-color 0.2s",
    },
    inputFocused: {
      borderColor: "#088FC4",
      background: "rgba(8,143,196,0.08)",
    },
    eyeBtn: {
      position: "absolute", right: 12, top: "50%",
      transform: "translateY(-50%)",
      background: "none", border: "none",
      color: "rgba(255,255,255,0.35)",
      cursor: "pointer", padding: 4,
      display: "flex", alignItems: "center",
    },
    error: {
      background: "rgba(220,53,69,0.12)",
      border: "1px solid rgba(220,53,69,0.3)",
      borderRadius: 3,
      padding: "10px 14px",
      color: "#ff8a8a",
      fontSize: 13,
      fontFamily: "'Hind Madurai', sans-serif",
      marginBottom: 20,
    },
    btn: {
      width: "100%",
      padding: "13px 20px",
      background: "#088FC4",
      border: "none",
      borderRadius: 3,
      color: "#fff",
      fontFamily: "'Montserrat', sans-serif",
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      cursor: "pointer",
      transition: "background 0.2s, opacity 0.2s",
      marginTop: 4,
    },
    btnLoading: { opacity: 0.7, cursor: "not-allowed" },
    footer: {
      marginTop: 28,
      paddingTop: 20,
      borderTop: "1px solid rgba(255,255,255,0.07)",
      fontFamily: "'Hind Madurai', sans-serif",
      fontSize: 11,
      color: "rgba(255,255,255,0.2)",
      textAlign: "center",
    },
  };

  const [focused, setFocused] = useState("");

  return (
    <div style={s.page}>
      <div style={s.slash1} />
      <div style={s.slash2} />

      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <img src={snsLogo} alt="Sun & Sun" style={s.logo} />
          <div style={s.divider} />
          <div>
            <div style={s.brandText}>Sun & Sun</div>
            <div style={s.brandSub}>International ERP</div>
          </div>
        </div>

        {/* Heading */}
        <div style={s.heading}>Giriş Yap</div>
        <div style={s.subheading}>ERP paneline erişmek için giriş yapın</div>

        <form onSubmit={handleSubmit} autoComplete="on">
          {/* Email */}
          <div style={s.inputWrap}>
            <label style={s.label}>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused("")}
              style={{
                ...s.input,
                ...(focused === "email" ? s.inputFocused : {}),
              }}
              placeholder="ornek@sunandsun.com.tr"
              required
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div style={s.inputWrap}>
            <label style={s.label}>Şifre</label>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused("")}
              style={{
                ...s.input,
                paddingRight: 40,
                ...(focused === "password" ? s.inputFocused : {}),
              }}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              style={s.eyeBtn}
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
            >
              {showPw ? (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {/* Error */}
          {error && <div style={s.error}>⚠ {error}</div>}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{ ...s.btn, ...(loading ? s.btnLoading : {}) }}
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap →"}
          </button>
        </form>

        <div style={s.footer}>
          © 2025 Sun & Sun International · Tüm hakları saklıdır
        </div>
      </div>
    </div>
  );
}
