import { useNavigate } from "react-router-dom";
import styles from "./ModeSwitch.module.scss";

interface Props {
  active: "inspect" | "repair";
}

/** Switch between the two jobs: inspecting trackers, and recording panel repairs. */
export default function ModeSwitch({ active }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.switch} role="tablist" aria-label="Job type">
      <button type="button" role="tab" aria-selected={active === "inspect"} onClick={() => active !== "inspect" && navigate("/inspect")}>
        Inspect
      </button>
      <button type="button" role="tab" aria-selected={active === "repair"} onClick={() => active !== "repair" && navigate("/repair")}>
        Repair
      </button>
    </div>
  );
}
