import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearLog, readLog } from "../../lib/debugLog";
import styles from "./DebugLog.module.scss";

/** What the app has been doing, newest at the bottom. For finding upload problems in the field. */
export default function DebugLog() {
  const navigate = useNavigate();
  const [lines, setLines] = useState<string[]>(readLog);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setLines(readLog()), 2000);
    return () => clearInterval(t);
  }, []);

  const info = `online=${navigator.onLine} · ${navigator.userAgent}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText([info, ...lines].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the text is on screen: take a screenshot instead */
    }
  };

  return (
    <div className={styles.page}>
      <h1>App log</h1>
      <p className={styles.info}>{info}</p>
      <div className={styles.buttons}>
        <button type="button" onClick={() => navigate(-1)}>
          Back
        </button>
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => {
            clearLog();
            setLines([]);
          }}
        >
          Clear
        </button>
      </div>
      {lines.length === 0 ? <p className={styles.info}>Nothing logged yet.</p> : <pre>{lines.join("\n")}</pre>}
    </div>
  );
}
