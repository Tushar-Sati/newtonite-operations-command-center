import { useState, type FormEvent } from "react";
import { createLazyFileRoute, Navigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createLazyFileRoute("/login")({ component: LoginPageForTest });

const nodes = [
  { name: "Incident response", x: "18%", y: "25%", color: "cyan" },
  { name: "Workforce planning", x: "76%", y: "18%", color: "amber" },
  { name: "Payments operations", x: "83%", y: "68%", color: "red" },
  { name: "Compliance", x: "26%", y: "76%", color: "cyan" },
  { name: "Logistics control", x: "53%", y: "13%", color: "cyan" },
  { name: "Customer escalations", x: "66%", y: "84%", color: "amber" },
] as const;

export function LoginPageForTest() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Sign in failed. Check your details and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell min-h-screen">
      <section className="login-form-side" aria-label="Sign in to Newtonite Operations">
        <div className="login-form-wrap">
          <a href="/login" className="login-brand" aria-label="Newtonite Operations home">
            <span className="login-brand-mark">
              <Activity size={19} strokeWidth={2.2} />
            </span>
            <span>
              <strong>NEWTONITE</strong>
              <small>OPERATIONS</small>
            </span>
          </a>

          <div className="login-heading">
            <p className="login-eyebrow">
              <span className="signal-dot" /> SECURE OPERATIONS ACCESS
            </p>
            <h1>
              Coordinate critical work.
              <br />
              <span>Keep operations moving.</span>
            </h1>
            <p className="login-intro">
              Authorized teams manage incidents, approvals, and operational work from one secure
              workspace.
            </p>
          </div>

          <div className="login-card command-panel">
            <div className="login-card-heading">
              <div>
                <h2>Welcome back</h2>
                <p>Sign in with your Newtonite account.</p>
              </div>
              <span className="login-lock">
                <LockKeyhole size={17} />
              </span>
            </div>
            <form className="login-form" onSubmit={submit}>
              <label className="login-field" htmlFor="login-email">
                <span>Email address</span>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(message)}
                  aria-describedby={message ? "login-error" : undefined}
                />
              </label>
              <label className="login-field" htmlFor="login-password">
                <span>Password</span>
                <span className="password-control">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(message)}
                    aria-describedby={message ? "login-error" : undefined}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {message && (
                <p id="login-error" role="alert" className="login-error">
                  <span className="error-mark">!</span>
                  <span>
                    <strong>We couldn’t sign you in</strong>
                    <small>{message}</small>
                  </span>
                </p>
              )}
              <Button type="submit" disabled={busy} className="login-submit">
                {busy ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" /> Verifying credentials…
                  </>
                ) : (
                  <>
                    Sign in securely <ArrowUpRight size={16} />
                  </>
                )}
              </Button>
              <p className="login-provisioning">
                <ShieldCheck size={14} /> Accounts are provisioned by an administrator.
              </p>
            </form>
          </div>

          <div className="demo-access">
            <p className="demo-title">
              LOCAL DEMO ACCESS <span>DEVELOPMENT ONLY</span>
            </p>
            <p>
              Manager, member, and viewer demo roles are available in local development. Use the
              seeded accounts and password documented in the project README.
            </p>
          </div>

          <div className="trust-row" aria-label="Security features">
            <span>
              <ShieldCheck size={14} /> Role-based access
            </span>
            <span>
              <Activity size={14} /> Auditable activity
            </span>
            <span>
              <Workflow size={14} /> Concurrency-safe workflows
            </span>
          </div>
          <p className="login-copyright">
            © 2026 Newtonite Operations <span>•</span> Authorized access only
          </p>
        </div>
      </section>

      <aside className="login-visual" aria-label="Operations network demonstration snapshot">
        <div className="visual-topline">
          <span className="visual-label">
            <span className="live-dot" /> OPERATIONS NETWORK
          </span>
          <span className="visual-index">FIELD VIEW / 01</span>
        </div>
        <div className="visual-copy">
          <p>ONE CONNECTED PICTURE</p>
          <h2>
            See the signal.
            <br />
            <span>Move with clarity.</span>
          </h2>
          <div className="visual-rule" />
        </div>
        <div
          className="network-stage login-network"
          aria-label="Illustrative connected operational teams"
        >
          <svg
            className="network-lines"
            viewBox="0 0 600 430"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="line-glow" x1="0" x2="1">
                <stop stopColor="#38c9e5" stopOpacity=".08" />
                <stop offset=".5" stopColor="#43d5e5" stopOpacity=".68" />
                <stop offset="1" stopColor="#38c9e5" stopOpacity=".08" />
              </linearGradient>
            </defs>
            <path
              d="M110 108 L320 55 L456 77 L492 292 L390 360 L156 327 Z M110 108 L294 222 L456 77 M294 222 L492 292 M294 222 L156 327 M320 55 L390 360"
              fill="none"
              stroke="url(#line-glow)"
              strokeWidth="1.2"
            />
            <path
              className="signal-path"
              d="M110 108 L294 222 L492 292"
              fill="none"
              stroke="#43d5e5"
              strokeWidth="1.5"
              strokeDasharray="4 12"
            />
            <path
              className="signal-path signal-path-delay"
              d="M156 327 L294 222 L456 77"
              fill="none"
              stroke="#f1b853"
              strokeWidth="1.2"
              strokeDasharray="3 16"
            />
          </svg>
          <div className="network-core">
            <Activity size={19} />
            <span>NEWTONITE</span>
            <small>COMMAND</small>
          </div>
          {nodes.map((node) => (
            <div
              className={`network-node node-${node.color}`}
              key={node.name}
              style={{ left: node.x, top: node.y }}
            >
              <span className="node-orb" />
              <span className="node-label">{node.name}</span>
            </div>
          ))}
          <div className="network-coordinate">
            NETWORK STATUS <b>CONNECTED</b>
          </div>
        </div>
        <div className="snapshot-label">
          DEMONSTRATION SNAPSHOT <span>Illustrative operational view</span>
        </div>
        <div className="snapshot-grid">
          <div className="snapshot-card">
            <span>System health</span>
            <strong>
              <i className="health-dot" /> Operational
            </strong>
            <small>Services responding</small>
          </div>
          <div className="snapshot-card">
            <span>Active teams</span>
            <strong>
              07 <em>teams</em>
            </strong>
            <small>Across the workspace</small>
          </div>
          <div className="snapshot-card">
            <span>Needs attention</span>
            <strong className="amber-value">
              12 <em>items</em>
            </strong>
            <small>Review and follow-up</small>
          </div>
        </div>
        <div className="signal-feed">
          <div className="signal-feed-title">
            <span>RECENT OPERATIONAL SIGNALS</span>
            <span>DEMO</span>
          </div>
          <div className="signal-row">
            <span className="feed-icon feed-cyan">
              <Activity size={13} />
            </span>
            <span>
              <strong>Incident queue updated</strong>
              <small>Incident Response · 4 min ago</small>
            </span>
            <i className="feed-marker" />
          </div>
          <div className="signal-row">
            <span className="feed-icon feed-amber">
              <Users size={13} />
            </span>
            <span>
              <strong>Approval requires review</strong>
              <small>Compliance · 11 min ago</small>
            </span>
            <i className="feed-marker amber-marker" />
          </div>
        </div>
        <div className="visual-footer">
          <span>COORDINATED OPERATIONS</span>
          <span>BUILT FOR TEAMS IN MOTION</span>
        </div>
      </aside>
    </main>
  );
}
