import { useStore } from "../store";
import { Help } from "./Help";
import { dayLabel, isMidnight, num, timeAt, timeText } from "../util";

/** One row per charger, one bar per car visit (arrival to departure). The fill shows how much
 *  of the requested energy was delivered; a red outline means the car left short. */
export function Sessions() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  if (!r) return null;
  const chargers = site.assets.filter((a) => a.type === "ev_charger");
  if (!chargers.length) return null;
  const { start, step_minutes: step, steps: T } = r.time;
  const at = (i: number) => `${(i / T) * 100}%`;
  const days = Array.from({ length: T }, (_, i) => i).filter((i) => isMidnight(start, step, i));

  return (
    <div className="gantt">
      <div className="legend">
        <span><i className="sw" /> Plugged in</span>
        <span><i className="sw fill" /> Energy delivered</span>
        <span><i className="sw short" /> Left short</span>
        <span>Bar label: delivered/requested kWh</span>
        <Help topic="sessions" />
      </div>
      <div className="gantt-grid">
        <div className="gantt-axis">
          {days.map((i) => <span key={i} style={{ left: at(i) }}>{dayLabel(timeAt(start, step, i))}</span>)}
        </div>
        {chargers.map((c) => {
          const visits = r.result.sessions.filter((s) => s.charger === c.id);
          return (
            <div className="gantt-row" key={c.id}>
              <span className="gantt-label" title={String(c.sessions)}>{c.name || c.id}</span>
              <div className="gantt-track">
                {days.map((i) => <i key={i} className="gantt-day" style={{ left: at(i) }} />)}
                {visits.map((s) => {
                  const share = s.requested_kwh > 0 ? Math.min(1, s.delivered_kwh / s.requested_kwh) : 1;
                  const short = s.unmet_kwh != null && s.unmet_kwh > 0.05;
                  const open = s.unmet_kwh == null;
                  const title = `${timeText(start, step, s.arrival)} → ${timeText(start, step, s.departure)}: `
                    + `${num(s.delivered_kwh, 1)} of ${num(s.requested_kwh, 1)} kWh delivered`
                    + (short ? `, ${num(s.unmet_kwh!, 1)} kWh short` : open ? " (still plugged in at the end)" : "");
                  return (
                    <button key={`${s.arrival}-${s.ev}`} className={`visit ${short ? "short" : ""} ${open ? "open" : ""}`}
                      style={{ left: at(s.arrival), width: at(Math.max(s.departure - s.arrival, 1)) }}
                      title={title} aria-label={title} onClick={() => { useStore.getState().setPlaying(false); setCursor(s.arrival); }}>
                      <span className="visit-fill" style={{ width: `${share * 100}%` }} />
                      {/* Delivered/requested in kWh (unit in the legend), one decimal so a car that left
                          slightly short does not read "9/9". The empty <i> lets the number wrap onto a
                          hidden second line when the bar is too narrow: shown whole or not at all. */}
                      <span className="visit-label" aria-hidden><i /><span>{num(s.delivered_kwh, 1)}/{num(s.requested_kwh, 1)}</span></span>
                    </button>
                  );
                })}
                <i className="gantt-cursor" style={{ left: at(cursor) }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
