import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import LoginAndSessionForm from "./components/LoginAndSessionForm/LoginAndSessionForm";
import Menu from "./components/Menu/Menu";
import TimeSheet from "./components/TimeSheet/TimeSheet";
import PreviousWork from "./components/PreviousWork/PreviousWork";
import TorqueJobForm from "./components/TorqueJobForm/TorqueJobForm";
import Layout from "./components/Layout/Layout";

// ── Types ─────────────────────────────────────────────────
export interface Session {
  site: string;
  date: string;
  name: string;
  session_id: string;
  login_time: string;
  username: string;
  role: string;
  expiresAt: number;
}

export interface LoginUser {
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  expiresAt: number;
}

export interface User {
  username: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  role?: string;
}

export const TASK_OPTIONS: string[] = [
  "Other",
  "Check torque of bolts securing the pillars to foundation pad",
  "Retighten structural elemants fixing elements (post head, central post, slew drive bolts, torque tube bolts, U Bolts, splice and rail brackets)",
  "Retighten modules to their support brackets",
  "Check the condition of the galvanised surfaces and treat as required",
  "Check all the bolts and nuts on the structure for proper condition and tightness, replace any corroded or broken items.",
  "Check the condition of any welded joints on the structure",
  "Check reduction motor for lubricating oil leaks",
  "Check tightness of the fixing bolts between the reduction gearbox motor and the slew drive",
  "Check tightness of gearbox fixing screws",
  "Check the motor fixing screws for proper condition (replace as required)",
  "Check and clean bearings on the structure",
  "Check reduction gear box for proper condition, retighten screws and check for oil leaks.",
  "Lubricate reduction slew drive",
  "Check to general status of TCU,including the control buttons, battery level and any alarms displayed.",
  "Verify the emergency push-button",
  "Verify the antenna status",
];

function loadSession(): Session | null {
  const saved = localStorage.getItem("userSession");
  if (!saved) return null;
  const data: Session = JSON.parse(saved);
  if (Date.now() > data.expiresAt) {
    localStorage.removeItem("userSession");
    return null;
  }
  return data;
}

function loadLoginUser(): LoginUser | null {
  const stored = localStorage.getItem("loginUser");
  return stored ? JSON.parse(stored) : null;
}

// function ComingSoon({ name }: { name: string }) {
//   return (
//     <Layout session={null as any} onLogout={() => {}} logoutLoading={false}>
//       <div style={{ padding: "2rem", color: "var(--color-label)" }}>
//         <h2>{name}</h2>
//         <p
//           style={{ color: "var(--color-label-secondary)", marginTop: "0.5rem" }}
//         >
//           Coming soon — being rebuilt.
//         </p>
//       </div>
//     </Layout>
//   );
// }

export default function App() {
  const navigate = useNavigate();

  const [loginUser, setLoginUser] = useState<LoginUser | null>(loadLoginUser);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    fetch(
      "https://qse4hcpeq2.execute-api.ap-southeast-2.amazonaws.com/default/getUserList",
    )
      .then((res) => res.json())
      .then((data) => setAllUsers(data))
      .catch((err) => console.error("Failed to fetch user list:", err));
  }, [session]);

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      const stored = localStorage.getItem("userSession");
      if (stored) {
        const s: Session = JSON.parse(stored);
        if (s.session_id) {
          await fetch(
            "https://wxffaf19t7.execute-api.ap-southeast-2.amazonaws.com/prod/siteLogout",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: s.session_id }),
            },
          );
        }
      }
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.clear();
      setSession(null);
      setLoginUser(null);
      setLogoutLoading(false);
      navigate("/login");
    }
  };

  // ── Not logged in ─────────────────────────────────────────
  if (!loginUser || !session) {
    return (
      <Routes>
        <Route
          path="*"
          element={
            <LoginAndSessionForm
              onComplete={(newSession: Session) => {
                setLoginUser(loadLoginUser());
                setSession(newSession);
                navigate("/menu");
              }}
            />
          }
        />
      </Routes>
    );
  }

  const basePath = `${session.site}/${session.date}/${session.name}`
    .replace(/\s+/g, "_")
    .toLowerCase();
  const uploadProject = `maintenance_log/${basePath}`;

  // Shorthand to avoid repeating Layout props on every route
  const withLayout = (children: React.ReactNode) => (
    <Layout
      session={session}
      onLogout={handleLogout}
      logoutLoading={logoutLoading}
    >
      {children}
    </Layout>
  );

  return (
    <Routes>
      {/* Menu — no Layout (full page, has its own header) */}
      <Route
        path="/menu"
        element={
          <Menu
            session={session}
            handleLogout={handleLogout}
            logoutLoading={logoutLoading}
            setLogoutLoading={setLogoutLoading}
            setShowResetForm={setShowResetForm}
            showResetForm={showResetForm}
          />
        }
      />

      {/* Torque Job */}
      <Route
        path="/torque-job"
        element={withLayout(
          <TorqueJobForm session={session} project={uploadProject} />,
        )}
      />

      {/* Timesheet */}
      <Route
        path="/timesheet"
        element={withLayout(
          <TimeSheet session={session} allUsers={allUsers} header={null} />,
        )}
      />

      {/* Work Progress */}
      <Route
        path="/previous-work"
        element={withLayout(<PreviousWork session={session} header={null} />)}
      />

      {/* Placeholders — replace as each component gets built */}
      <Route
        path="/multisteptaskform"
        element={withLayout(<ComingSoonInner name="PM Tasks" />)}
      />
      <Route
        path="/realignmentform"
        element={withLayout(<ComingSoonInner name="Realignment Form" />)}
      />
      <Route
        path="/scan"
        element={withLayout(<ComingSoonInner name="Barcode Log" />)}
      />
      <Route
        path="/report"
        element={withLayout(<ComingSoonInner name="Report" />)}
      />
      <Route
        path="/reset-password"
        element={withLayout(<ComingSoonInner name="Reset Password" />)}
      />
      <Route
        path="/upload"
        element={withLayout(<ComingSoonInner name="Upload" />)}
      />

      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}

// Simple inner placeholder (no Layout wrapper — Layout is applied by withLayout above)
function ComingSoonInner({ name }: { name: string }) {
  return (
    <div style={{ color: "var(--color-label)" }}>
      <h2>{name}</h2>
      <p style={{ color: "var(--color-label-secondary)", marginTop: "0.5rem" }}>
        Coming soon — being rebuilt.
      </p>
    </div>
  );
}
