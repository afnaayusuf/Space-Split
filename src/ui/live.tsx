import type { ReactNode } from 'react';
import { HelpLink, type HelpTopic } from './Help';

/**
 * A device-style panel: a thin title strip over a dark body, the way Live
 * frames each device in a chain. `power` adds a labelled On / Off switch.
 */
export function Panel({
  title,
  power,
  onPower,
  actions,
  children,
  className,
  id,
  help,
}: {
  title: string;
  power?: boolean;
  onPower?: (on: boolean) => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Help topic for the "?" beside the title. */
  help?: HelpTopic;
}) {
  return (
    <section className={`panel${power === false ? ' is-off' : ''}${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <header className="panel-head">
        <h2 id={id}>{title}</h2>
        {help && <HelpLink topic={help} label={title} />}
        {(actions || power !== undefined) && (
          <div className="panel-actions">
            {actions}
            {power !== undefined && (
              <button type="button" className={`tgl power-tgl${power ? ' is-on' : ''}`} aria-pressed={power} aria-label={`${title}: ${power ? 'on' : 'off'}`} onClick={() => onPower?.(!power)}>
                {power ? 'On' : 'Off'}
              </button>
            )}
          </div>
        )}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** A Live-style toggle: grey when off, lit when on. */
export function Toggle({ on, onChange, children, title }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <button type="button" className={`tgl${on ? ' is-on' : ''}`} aria-pressed={on} title={title} onClick={() => onChange(!on)}>
      {children}
    </button>
  );
}

/** Segmented chooser, one option lit. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'is-active' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
