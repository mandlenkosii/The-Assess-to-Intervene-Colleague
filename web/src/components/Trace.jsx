import { useEffect, useMemo, useRef } from "react";
import { groupTraceEvents, visibleTraceEvents } from "./markingViewModel.js";
import "./marking.css";

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export function Trace({ events = [] }) {
  const scrollRef = useRef(null);
  const pausedRef = useRef(false);
  const visibleEvents = useMemo(() => visibleTraceEvents(events), [events]);
  const groups = useMemo(() => groupTraceEvents(visibleEvents), [visibleEvents]);

  useEffect(() => {
    if (!pausedRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleEvents]);

  function handleScroll() {
    const element = scrollRef.current;
    if (element) {
      pausedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight > 40;
    }
  }

  return (
    <section className="marking-panel trace-panel" aria-labelledby="trace-title">
      <header className="marking-panel__header">
        <div>
          <h2 id="trace-title">Live trace</h2>
          <p>Goal, plan, action, review, correction and delivery</p>
        </div>
        <span className="trace-count">{visibleEvents.length} events</span>
      </header>
      <div
        className="trace-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Agent activity trace"
        tabIndex={0}
      >
        {groups.map((group) => (
          <section className="trace-stage" key={group.id} aria-label={`${group.label} stage`}>
            <h3>{group.label}</h3>
            {group.events.length === 0 ? (
              <p className="trace-empty">Waiting</p>
            ) : (
              <ol>
                {group.events.map((event, index) => (
                  <li className="trace-event" key={`${event.t}-${event.agent}-${index}`}>
                    <time dateTime={event.t}>{formatTime(event.t)}</time>
                    <span className="trace-agent">{event.agent}</span>
                    <span className="trace-message">{event.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
      {events.length > visibleEvents.length && (
        <p className="trace-window-note">Showing the latest {visibleEvents.length} of {events.length} events.</p>
      )}
    </section>
  );
}
