import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import {
  Star,
  Trash2,
  Archive,
  ExternalLink,
  Clock,
  RefreshCw,
  Save,
  Search,
  ChevronRight,
  MessageSquare,
  Smartphone,
  User,
  Calendar,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CalendarBox from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

function App() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [filter, setFilter] = useState('active'); // active, favorites, ignored
  const [nextRun, setNextRun] = useState('');
  const [search, setSearch] = useState('');
  const [liveStatus, setLiveStatus] = useState({ message: 'Aguardando...', progress: 0, currentItem: null, links: [] });
  const [whatsappStatus, setWhatsappStatus] = useState({ status: '...', hasQr: false });
  const [showCalendar, setShowCalendar] = useState(false);
  const [limit, setLimit] = useState(3);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('07:00');
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchListings();
    fetchConfig();
    fetchStatus();
    fetchWhatsapp();
    const interval = setInterval(() => {
      fetchListings();
      fetchStatus();
      fetchWhatsapp();
    }, 15000); // Mais frequente para monitoramento
    return () => clearInterval(interval);
  }, [filter]);

  // Detecta automaticamente a URL da API baseada no ambiente
  const API_BASE_URL = window.location.origin.includes('localhost')
    ? 'http://localhost:7860'
    : (window.location.origin.includes('vercel.app')
      ? 'https://olx-12ntim1b.b4a.run' // Fallback para o backend no B4A se estiver no Vercel
      : window.location.origin);

  const fetchWhatsapp = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-status`);
      if (!response.ok) throw new Error('Falha ao buscar status do WhatsApp');
      const data = await response.json();
      setWhatsappStatus(data);
    } catch (error) {
      console.error("Error fetching whatsapp status:", error);
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      if (!response.ok) throw new Error('Falha ao buscar status do scraper');
      const data = await response.json();
      if (data) {
        setLiveStatus({
          message: data.message,
          progress: data.progress,
          currentItem: data.currentItem,
          links: data.links || []
        });
        if (data.progress > 0 && data.progress < 100) {
          setIsScraping(true);
        } else if (data.progress === 100 || data.progress === 0) {
          setIsScraping(false);
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const fetchListings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/listings?filter=${filter}`);
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      const results = await response.json();

      const mappedResults = Array.isArray(results) ? results.map(item => ({
        id: item.objectId,
        get: (field) => item[field],
        set: (field, value) => { item[field] = value }
      })) : [];

      setListings(mappedResults);
    } catch (error) {
      console.error("Error fetching listings:", error);
      // Opcional: mostrar mensagem de erro na UI
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/config`);
      const data = await response.json();
      if (data) {
        if (data.next_run) setNextRun(data.next_run);
        if (data.limit_value) setLimit(data.limit_value);
        if (data.limit_enabled) setLimitEnabled(data.limit_enabled === "true");
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const saveConfig = async (key, value) => {
    try {
      await fetch(`${API_BASE_URL}/api/set-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
    } catch (error) {
      console.error("Error saving config:", error);
    }
  };

  const handleUpdateListing = async (listing, updates) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/update-listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: listing.id, updates })
      });

      if (response.ok) {
        fetchListings();
      }
    } catch (error) {
      console.error("Error updating listing:", error);
    }
  };

  const runScraper = async () => {
    setIsScraping(true);
    try {
      const runLimit = limitEnabled ? parseInt(limit) : 999;
      const response = await fetch(`${API_BASE_URL}/api/run-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: runLimit })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao iniciar');
      }

      alert(`Scraper iniciado! Limite: ${limitEnabled ? limit : 'Sem limite'}`);
    } catch (error) {
      console.error("Erro ao disparar scraper:", error);
      alert("Erro ao disparar scraper: " + error.message);
    } finally {
      setTimeout(() => setIsScraping(false), 5000);
    }
  };

  const handleSaveSchedule = async () => {
    const [hours, minutes] = scheduledTime.split(':');
    const nextTime = DateTime.fromJSDate(selectedDate).set({
      hour: parseInt(hours),
      minute: parseInt(minutes)
    }).toISO();

    try {
      const response = await fetch(`${API_BASE_URL}/api/set-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextRun: nextTime })
      });

      if (!response.ok) throw new Error('Erro ao salvar');

      setNextRun(nextTime);
      setShowCalendar(false);
      alert("Agendamento salvo para: " + DateTime.fromISO(nextTime).toFormat('dd/MM HH:mm'));
    } catch (e) {
      console.error("Erro completo:", e);
      alert("Erro ao atualizar agendamento: " + e.message);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm("⚠️ ATENÇÃO: Isso apagará TODOS os registros da base (Favoritos, Ignorados e Ativos). Deseja continuar?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/clear-database`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        alert(`Base limpa com sucesso! ${data.count} registros removidos.`);
        fetchListings(); // Recarrega a lista (que deve ficar vazia)
      } else {
        throw new Error(data.error || 'Erro ao limpar');
      }
    } catch (err) {
      console.error("❌ Erro ao limpar base de dados:", err.message);
      alert("Erro ao limpar base: " + err.message);
    }
  };

  const filteredListings = listings.filter(l =>
    l.get("price").toLowerCase().includes(search.toLowerCase()) ||
    l.get("link").toLowerCase().includes(search.toLowerCase()) ||
    (l.get("notes") || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            OpenHouses Pro OLX
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '5px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: 'rgba(99, 102, 241, 0.1)',
              borderRadius: '20px',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              color: 'var(--primary)',
              fontWeight: 600
            }}>
              <Calendar size={14} />
              AGENDADO: {nextRun ? DateTime.fromISO(nextRun).toFormat('dd/MM \'às\' HH:mm') : 'Não agendado'}
            </span>

            <a
              href={`${API_BASE_URL}/qr`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                background: whatsappStatus.status.includes('Pronto') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                borderRadius: '20px',
                border: `1px solid ${whatsappStatus.status.includes('Pronto') ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                color: whatsappStatus.status.includes('Pronto') ? '#22c55e' : '#f59e0b',
                fontWeight: 600,
                textDecoration: 'none',
                marginLeft: '10px'
              }}
            >
              <Smartphone size={14} />
              WHATSAPP: {whatsappStatus.status}
              {whatsappStatus.hasQr && <span style={{ padding: '2px 6px', background: '#ef4444', color: 'white', borderRadius: '4px', fontSize: '0.6rem', marginLeft: '4px' }}>QR</span>}
            </a>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="glass"
            style={{
              padding: '10px 15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'white',
              background: showCalendar ? 'var(--primary)' : 'rgba(255,255,255,0.05)'
            }}
          >
            <Calendar size={18} />
          </button>

          <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '5px 12px', gap: '8px' }}>
            <input
              type="checkbox"
              checked={limitEnabled}
              onChange={() => {
                const newState = !limitEnabled;
                setLimitEnabled(newState);
                saveConfig('limit_enabled', newState);
              }}
              style={{
                cursor: 'pointer',
                width: '18px',
                height: '18px',
                accentColor: 'var(--primary)'
              }}
            />

            <span
              onClick={() => {
                const newState = !limitEnabled;
                setLimitEnabled(newState);
                saveConfig('limit_enabled', newState);
              }}
              style={{
                fontSize: '0.7rem',
                color: limitEnabled ? 'white' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              LIMITE (MAX):
            </span>
            <input
              type="number"
              value={limit}
              disabled={!limitEnabled}
              onChange={(e) => {
                setLimit(e.target.value);
                saveConfig('limit_value', e.target.value);
              }}
              style={{
                width: '35px',
                background: 'transparent',
                border: 'none',
                textAlign: 'center',
                padding: '5px 0',
                fontSize: '0.9rem',
                opacity: limitEnabled ? 1 : 0.3,
                color: 'white',
                outline: 'none',
                borderBottom: limitEnabled ? '1px solid rgba(255,255,255,0.2)' : 'none'
              }}
              min="1"
              max="500"
            />
          </div>

          <button
            onClick={runScraper}
            disabled={isScraping}
            style={{
              background: 'var(--primary)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
            }}
          >
            <RefreshCw size={18} className={isScraping ? 'spin' : ''} />
            {isScraping ? 'Rodando...' : 'Extrair Agora'}
          </button>

          <button
            onClick={handleClearDatabase}
            title="Apagar Toda a Base"
            style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: 'var(--accent)',
              padding: '10px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      {/* Calendário de Agendamento */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="glass"
            style={{ marginBottom: '25px', padding: '20px', overflow: 'hidden' }}
          >
            <h4 style={{ marginBottom: '15px', fontWeight: 600 }}>Escolha a data e hora:</h4>
            <div className="calendar-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <CalendarBox
                onChange={setSelectedDate}
                value={selectedDate}
                minDate={new Date()}
                className="custom-calendar"
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', width: '100%', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px' }}>
                <Clock size={20} color="var(--primary)" />
                <span style={{ fontWeight: 600 }}>Horário:</span>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--primary)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '8px',
                    fontSize: '1.1rem'
                  }}
                />
              </div>

              <button
                onClick={handleSaveSchedule}
                style={{
                  width: '100%',
                  background: 'var(--primary)',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
                }}
              >
                SALVAR AGENDAMENTO
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Monitor em Tempo Real */}
      <AnimatePresence>
        {isScraping && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="glass"
            style={{ marginBottom: '25px', padding: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--primary)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Monitor de Extração Live
              </span>
              <span style={{ fontSize: '0.9rem', color: 'white' }}>{liveStatus.progress}%</span>
            </div>

            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '15px' }}>
              <motion.div
                style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent))' }}
                animate={{ width: `${liveStatus.progress}%` }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="spin" style={{ width: '15px', height: '15px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
              <span style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{liveStatus.message}</span>
            </div>

            {liveStatus.currentItem && (
              <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', borderLeft: '3px solid var(--primary)' }}>
                PROCESSANDO: {liveStatus.currentItem}
              </div>
            )}

            {liveStatus.links && liveStatus.links.length > 0 && (
              <div style={{ marginTop: '15px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Registros Encontrados ({liveStatus.links.length}):
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {liveStatus.links.map((link, idx) => (
                    <div key={idx} className="glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%', color: 'var(--text-main)' }}>
                        {link}
                      </span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(link);
                          }}
                          style={{ background: 'transparent', padding: '0', color: 'var(--text-muted)' }}
                          title="Copiar Link"
                        >
                          <Copy size={14} />
                        </button>
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}
                          title="Abrir Anúncio"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                  )).reverse()}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Tabs */}
      <div style={{ marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
          <input
            type="text"
            placeholder="Pesquisar links, preços ou notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '45px', height: '50px', fontSize: '1rem' }}
          />
        </div>

        <div className="glass" style={{ display: 'flex', padding: '5px', gap: '5px' }}>
          {['active', 'favorites', 'ignored'].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '12px',
                background: filter === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: filter === t ? 'white' : 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'capitalize'
              }}
            >
              {t === 'active' ? 'Todos' : t === 'favorites' ? 'Favoritos' : 'Ignorados'}
            </button>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div style={{ display: 'grid', gap: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Carrregando imóveis...</div>
        ) : filteredListings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Nenhum item encontrado.</div>
        ) : (
          <AnimatePresence>
            {filteredListings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                onUpdate={handleUpdateListing}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ListingCard({ listing, onUpdate }) {
  const [note, setNote] = useState(listing.get("notes") || "");
  const [showNote, setShowNote] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass"
      style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
        <div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>{listing.get("price")}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            Capturado: {listing.get("capturedAt") ? DateTime.fromJSDate(listing.get("capturedAt")).toRelative() : (listing.get("lastUpdated") ? DateTime.fromJSDate(listing.get("lastUpdated")).toRelative() : 'Recentemente')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onUpdate(listing, { isFavorite: !listing.get("isFavorite") })}
            style={{
              background: listing.get("isFavorite") ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
              color: listing.get("isFavorite") ? '#f59e0b' : 'var(--text-muted)',
              padding: '8px',
              borderRadius: '10px'
            }}
          >
            <Star fill={listing.get("isFavorite") ? "currentColor" : "none"} size={20} />
          </button>
          <button
            onClick={() => onUpdate(listing, { status: listing.get("status") === 'ignored' ? 'active' : 'ignored' })}
            style={{
              background: listing.get("status") === 'ignored' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.05)',
              color: listing.get("status") === 'ignored' ? 'var(--accent)' : 'var(--text-muted)',
              padding: '8px',
              borderRadius: '10px'
            }}
          >
            {listing.get("status") === 'ignored' ? <RefreshCw size={20} /> : <Archive size={20} />}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)', fontSize: '0.95rem' }}>
          <User size={16} />
          <span style={{ fontWeight: 600 }}>{listing.get("contactName") || "Vendedor"}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          <Smartphone size={16} />
          <span>{listing.get("phone")}</span>
          {listing.get("waLink") && (
            <a
              href={listing.get("waLink")}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#25D366',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem',
                textDecoration: 'none',
                fontWeight: 600,
                background: 'rgba(37, 211, 102, 0.1)',
                padding: '2px 8px',
                borderRadius: '12px'
              }}
            >
              <MessageSquare size={12} /> WhatsApp
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <a
          href={listing.get("link")}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.05)',
            color: 'white',
            textDecoration: 'none',
            padding: '12px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontWeight: 600
          }}
        >
          Ver no OLX <ExternalLink size={16} />
        </a>
        <button
          onClick={() => setShowNote(!showNote)}
          className="glass"
          style={{ padding: '12px', color: 'white', borderRadius: '10px' }}
        >
          <MessageSquare size={18} />
        </button>
      </div>

      <AnimatePresence>
        {showNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ marginTop: '15px', overflow: 'hidden' }}
          >
            <textarea
              rows="3"
              placeholder="Adicionar observações..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ fontSize: '0.9rem' }}
            />
            <button
              onClick={() => {
                onUpdate(listing, { notes: note });
                setShowNote(false);
              }}
              style={{
                marginTop: '10px',
                width: '100%',
                background: 'var(--primary)',
                color: 'white',
                padding: '8px',
                borderRadius: '8px',
                fontWeight: 600
              }}
            >
              Salvar Notas
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
