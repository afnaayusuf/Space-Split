import { useEffect, useRef, useState, type ReactNode } from 'react';

const show = (v: number) => (Number.isFinite(v) ? String(Number.isInteger(v) ? v : +v.toFixed(3)) : '');

/**
 * Number box that lets the user type freely ("4.", "") and only reports
 * finite values. Shows the stored value again when it loses focus.
 */
export function NumInput({
  id,
  value,
  onChange,
  label,
  min = 0,
  invalid,
  className,
  blankZero,
  placeholder,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  label?: string;
  min?: number;
  invalid?: boolean;
  className?: string;
  /** Show 0 as an empty box (with the placeholder), e.g. an open-ended band. */
  blankZero?: boolean;
  placeholder?: string;
}) {
  const shown = (v: number) => (blankZero && v === 0 ? '' : show(v));
  const [text, setText] = useState(shown(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(blankZero && value === 0 ? '' : show(value));
  }, [value, blankZero]);
  const parsed = parseFloat(text);
  const bad = invalid || (text.trim() !== '' && (!Number.isFinite(parsed) || parsed < min));
  return (
    <input
      id={id}
      className={`num${bad ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={bad || undefined}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(shown(value));
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') onChange(0);
        else {
          const v = parseFloat(t);
          if (Number.isFinite(v) && v >= min) onChange(v);
        }
      }}
    />
  );
}

export function Field({ id, label, unit, help, children }: { id: string; label: string; unit?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-input">
        {children}
        {unit && <span className="field-unit">{unit}</span>}
      </div>
      {help && <p className="field-help">{help}</p>}
    </div>
  );
}

export function Check({ id, label, checked, onChange, help }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  return (
    <div className="field check">
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      {help && <p className="field-help">{help}</p>}
    </div>
  );
}
