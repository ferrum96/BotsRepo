import { Component, useEffect, useState } from "react";
import { useRawInitData } from "@telegram-apps/sdk-react";
import { openInvoice, readInitData, shareLink } from "./telegram.js";

const initDataRaw = readInitData();

class QuietBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function TelegramMode({ onChange }) {
  const raw = useRawInitData();
  useEffect(() => {
    onChange(Boolean(raw));
  }, [raw, onChange]);
  return null;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (initDataRaw) {
    headers["X-Telegram-Init-Data"] = initDataRaw;
  } else if (import.meta.env.DEV) {
    headers["X-Dev-User-Id"] = "1";
  }
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Запрос не прошёл");
  }
  return payload;
}

export function App() {
  const [insideTelegram, setInsideTelegram] = useState(Boolean(initDataRaw));
  const [place, setPlace] = useState("");
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [unknownTime, setUnknownTime] = useState(false);
  const [chart, setChart] = useState(null);
  const [cards, setCards] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);

  useEffect(() => {
    api("/api/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  async function searchPlace(event) {
    event.preventDefault();
    setError("");
    try {
      const payload = await api(`/api/geocode?q=${encodeURIComponent(place)}`);
      setHits(payload.results || []);
      setPicked(payload.results?.[0] || null);
      if (!payload.results?.length) {
        setError("Место не нашлось");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!picked) {
      setError("Сначала выбери место");
      return;
    }
    setError("");
    try {
      const saved = await api("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth_date: birthDate,
          birth_time: unknownTime ? "12:00" : birthTime,
          birth_time_known: !unknownTime,
          birth_place: picked.label,
          latitude: picked.latitude,
          longitude: picked.longitude,
        }),
      });
      setChart(saved);
    } catch (err) {
      setError(err.message);
    }
  }

  async function drawCards() {
    setError("");
    setRevealed(false);
    try {
      const payload = await api("/api/tarot", { method: "POST" });
      setCards(payload.cards || []);
      window.setTimeout(() => setRevealed(true), 80);
    } catch (err) {
      setError(err.message);
    }
  }

  async function buyPro() {
    setError("");
    try {
      const payload = await api("/api/invoice", { method: "POST" });
      openInvoice(payload.url);
    } catch (err) {
      setError(err.message);
    }
  }

  function invite() {
    if (me?.share_url) {
      shareLink(me.share_url);
    }
  }

  return (
    <main>
      <QuietBoundary fallback={null}>
        <TelegramMode onChange={setInsideTelegram} />
      </QuietBoundary>
      <header>
        <h1>Карта и таро</h1>
        <p>{me?.is_pro ? "Pro активен" : insideTelegram ? "Free: 1 таро в день" : "Открой внутри Telegram"}</p>
      </header>

      <form onSubmit={saveProfile}>
        <label>
          Дата рождения
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required />
        </label>
        <label>
          Время
          <input
            type="time"
            value={birthTime}
            onChange={(event) => setBirthTime(event.target.value)}
            required={!unknownTime}
            disabled={unknownTime}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={unknownTime}
            onChange={(event) => setUnknownTime(event.target.checked)}
          />
          Время неизвестно
        </label>
        <label>
          Место
          <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Город, страна" />
        </label>
        <button type="button" onClick={searchPlace}>Найти место</button>
        {hits.length > 0 && (
          <div className="hits">
            {hits.map((hit) => (
              <button
                type="button"
                key={`${hit.latitude}-${hit.longitude}`}
                className={picked === hit ? "hit active" : "hit"}
                onClick={() => setPicked(hit)}
              >
                {hit.label}
              </button>
            ))}
          </div>
        )}
        <button type="submit">Сохранить карту</button>
      </form>

      {chart && (
        <section>
          <h2>Карта</h2>
          <p>Солнце: {chart.sun_sign}</p>
          <p>Луна: {chart.moon_sign}</p>
          <p>Асцендент: {chart.ascendant_sign}</p>
        </section>
      )}

      <section>
        <h2>Три карты</h2>
        <button type="button" onClick={drawCards}>Вытянуть</button>
        <div className="spread">
          {cards.map((card) => (
            <article key={card.position} className={revealed ? "card open" : "card"}>
              <div className="inner">
                <div className="face back">{card.position}</div>
                <div className="face front">
                  <strong>{card.name}</strong>
                  <span>{card.meaning}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="actions">
        <button type="button" onClick={buyPro}>Купить Pro — 299 ₽/мес</button>
        <button type="button" onClick={invite}>Пригласить</button>
      </section>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
