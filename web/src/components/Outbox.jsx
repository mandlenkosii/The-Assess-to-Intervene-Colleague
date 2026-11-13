function plainText(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function Outbox({ messages = [] }) {
  return (
    <section className="card outbox-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Delivery status</p><h2>Outbox</h2></div>
        <span className="count-label">{messages.length} messages</span>
      </div>
      {messages.length === 0
        ? <p className="muted">Generated emails will be listed here, including failures and skipped recipients.</p>
        : <ul className="outbox-list">{messages.map((message, index) => (
          <li key={`${message.learner_id ?? message.to}-${index}`}>
            <div className="outbox-message">
              <strong>{message.to || message.learner_id || "Unknown recipient"}</strong>
              <span>{message.subject}</span>
              {message.error && <small>{message.error}</small>}
              <details><summary>Preview email</summary><p>{plainText(message.html)}</p></details>
            </div>
            <span className={`badge badge-${message.status === "sent" ? "ok" : message.status === "failed" ? "needs-teacher" : "neutral"}`}>
              {message.status}
            </span>
          </li>
        ))}</ul>}
    </section>
  );
}
