import { useEffect, useState } from "react";
import { money, parseAmount, plain } from "../format";

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Show the value as a percentage (stored as a fraction). */
  percent?: boolean;
  decimals?: boolean;
}

/** Text box for amounts: shows "12,345" and accepts shorthand like "1.5萬" or "12k". */
export function NumberInput({ value, onChange, placeholder, className, ariaLabel, percent, decimals }: Props) {
  const shown = value === undefined ? undefined : percent ? value * 100 : value;
  const idle = shown === undefined ? "" : percent || decimals ? plain(shown) : money(shown);
  const [text, setText] = useState(idle);
  const [editing, setEditing] = useState(false);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!editing) setText(idle);
  }, [idle, editing]);

  const commit = (t: string) => {
    const n = parseAmount(t);
    if (n !== undefined && Number.isNaN(n)) {
      setBad(true);
      return;
    }
    setBad(false);
    const next = n === undefined ? undefined : percent ? n / 100 : n;
    if (next !== value) onChange(next);
  };

  return (
    <span className={`num-input ${percent ? "has-suffix" : ""}`}>
      <input
        className={`${className ?? ""} ${bad ? "bad" : ""}`}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={text}
        onFocus={e => {
          // keep the text as shown (commas parse fine) so nothing re-renders under the caret
          setEditing(true);
          e.target.select();
        }}
        onChange={e => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          setEditing(false);
          commit(text);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {percent && <span className="suffix">%</span>}
    </span>
  );
}
