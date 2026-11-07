import { useStore } from "../store";
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
      <div className="gantt-head">
        <h4>EV visits</h4>
        <span className="small muted">Bar = plugged in. Fill = energy delivered of energy needed. Red outline = left short. Click a bar to jump there.</span>
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
                      <span className="visit-text">{num(s.delivered_kwh)}/{num(s.requested_kwh)} kWh</span>
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
