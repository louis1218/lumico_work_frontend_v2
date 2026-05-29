import { useState } from "react";
import styles from "./LoginAndSessionForm.module.scss";
import type { Session } from "../../App";

interface LoginAndSessionFormProps {
  onComplete: (session: Session) => void;
}

interface FormData {
  username: string;
  password: string;
  date: string;
  site: string;
}

export default function LoginAndSessionForm({
  onComplete,
}: LoginAndSessionFormProps) {
  const [formData, setFormData] = useState<FormData>({
    username: "",
    password: "",
    date: new Date().toLocaleDateString("en-CA"),
    site: "lilyvale",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { username, password, site, date } = formData;
    if (!username || !password || !site) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        "https://3tjb71iip9.execute-api.ap-southeast-2.amazonaws.com/prod/SiteLogin",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, site }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      const { session_id, first_name, last_name, login_time, role } = data;
      const name = `${first_name} ${last_name}`;
      const expiresAt = Date.now() + 1000 * 60 * 60 * 12;

      const sessionObject: Session = {
        site,
        date,
        name,
        session_id,
        login_time,
        username,
        role,
        expiresAt,
      };

      localStorage.setItem(
        "loginUser",
        JSON.stringify({ username, first_name, last_name, role, expiresAt }),
      );
      localStorage.setItem("userSession", JSON.stringify(sessionObject));
      onComplete(sessionObject);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <img
            src="/lumico-logo-clear.png"
            alt="Lumico"
            className={styles.logo}
          />
          <div>
            {/* <div className={styles.logoName}>Lumico</div>
            <div className={styles.logoSub}>Electricals Pty Ltd</div> */}
          </div>
        </div>

        <h1 className={styles.title}>Staff Portal Login</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Username</label>
            <input
              className={styles.input}
              value={formData.username}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  username: e.target.value.toLowerCase(),
                })
              }
              placeholder="Enter username"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              placeholder="Enter password"
              required
            />
          </div>

          <div className={`${styles.field} ${styles.fieldDate}`}>
            <label className={styles.label}>Date</label>
            <input
              className={styles.input}
              type="date"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Solar Farm</label>
            <input
              className={`${styles.input} ${styles.disabled}`}
              value="Lilyvale"
              readOnly
              disabled
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? (
              <>
                <span className={styles.spinner} /> Logging in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
