import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FaCheck, FaChevronDown } from "react-icons/fa";
import styles from "./Dropdown.module.scss";

export interface DropdownOption {
  value: string;
  label: string;
  /** Small right-aligned note, e.g. "checked" */
  note?: string;
  tone?: "ok" | "issue";
}

interface Props {
  label: string;
  value: string;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  /** Show a filter box at the top of the list (for long lists) */
  searchable?: boolean;
  /** Numeric keyboard for the filter box (tracker numbers) */
  numeric?: boolean;
  /** Placeholder for the filter box */
  searchPlaceholder?: string;
  /** Which edge the open list lines up with. Use "right" for pickers at the right of the screen. */
  align?: "left" | "right";
  /** Keep the label for screen readers but do not show it */
  hideLabel?: boolean;
  className?: string;
  onChange: (value: string) => void;
}

/** A styled list picker that opens a scrollable panel. Works by touch, mouse and keyboard. */
export default function Dropdown({
  label,
  value,
  options,
  placeholder,
  disabled,
  searchable,
  numeric,
  searchPlaceholder,
  align = "left",
  hideLabel,
  className,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const shown = useMemo(
    () => (query ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options),
    [options, query],
  );
  const selected = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (v: string) => {
    onChange(v);
    close();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Scroll the current item into view when opening or moving with the keyboard
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown]);

  const openList = () => {
    if (disabled) return;
    const i = shown.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active].value);
    }
  };

  return (
    <div className={`${styles.root} ${className ?? ""}`} ref={root} onKeyDown={onKey}>
      <span className={`${styles.label} ${hideLabel ? styles.hidden : ""}`} id={`${id}-l`}>
        {label}
      </span>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-l ${id}-b`}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      >
        <span id={`${id}-b`} className={selected ? styles.value : styles.placeholder}>
          {selected ? selected.label : placeholder}
        </span>
        <FaChevronDown aria-hidden="true" className={open ? styles.flip : ""} />
      </button>

      {open && (
        <div className={`${styles.panel} ${align === "right" ? styles.alignRight : ""}`}>
          {searchable && (
            <input
              autoFocus
              className={styles.search}
              inputMode={numeric ? "numeric" : "text"}
              placeholder={searchPlaceholder ?? `Find ${label.toLowerCase()}`}
              aria-label={`Filter ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
          )}
          <ul className={styles.list} role="listbox" aria-labelledby={`${id}-l`} ref={list}>
            {shown.length === 0 && <li className={styles.empty}>No match</li>}
            {shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                data-tone={o.tone}
                className={styles.option}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.note && (
                  <em>
                    {o.tone === "ok" && <FaCheck aria-hidden="true" />} {o.note}
                  </em>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
