import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { GlobalLoader } from "../components/GlobalLoader";
import { parseApiError } from "../utils/apiError";
import {
  isValidOtp,
  isValidPhone,
  sanitizeOtpInput,
  sanitizePhoneInput,
} from "../utils/validation";
import { useUI } from "../ui";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const { showError } = useUI();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <GlobalLoader label="Starting Experientia…" />;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const phoneDigits = sanitizePhoneInput(phone);
    if (!isValidPhone(phoneDigits)) {
      showError("Enter a valid 10-digit phone number");
      return;
    }
    if (!isValidOtp(otp)) {
      showError("Enter the 6-digit OTP");
      return;
    }
    setBusy(true);
    try {
      await login(phoneDigits, sanitizeOtpInput(otp));
      navigate("/");
    } catch (err) {
      showError(parseApiError(err, "Sign in failed — check phone and OTP"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-panel">
        <Link to="/welcome" className="login-back">
          ← Back
        </Link>

        <h1>Experientia</h1>
        <p className="lede">
          Sign in with your registered phone number and OTP.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="stack">
          <label>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              placeholder="10-digit mobile"
              inputMode="numeric"
              maxLength={10}
              required
              autoComplete="tel"
            />
          </label>
          <label>
            OTP
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(sanitizeOtpInput(e.target.value))}
              placeholder="6-digit code"
              required
              autoComplete="one-time-code"
              className="otp-input"
            />
          </label>
          <button
            className="btn primary"
            disabled={busy || !isValidPhone(phone) || !isValidOtp(otp)}
            type="submit"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <div className="login-visual" aria-hidden />
    </div>
  );
}
