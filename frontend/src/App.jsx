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
  Home,
  Layout,
  Bath,
  Smartphone,
  User,
  Calendar,
  Copy,
  Maximize,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CalendarBox from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

const APP_VERSION = "2.1.0"; // Versão atual para controle de release

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [filter, setFilter] = useState('active'); // active, favorites, ignored
  const [nextRun, setNextRun] = useState('');
  const [search, setSearch] = useState('');
  const [liveStatus, setLiveStatus] = useState({ message: 'Aguardando...', progress: 0, currentItem: null, links: [] });
  // const [whatsappStatus, setWhatsappStatus] = useState({ status: '...', hasQr: false }); // WhatsApp Desabilitado
  const [showCalendar, setShowCalendar] = useState(false);
  const [limit, setLimit] = useState(3);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('07:00');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);
  const [scraperFilters, setScraperFilters] = useState({
    regions: ['alphaville', 'tambore', 'barueri'],
    types: ['venda'],
    priceMin: 1000000,
    priceMax: 50000000
  });

  useEffect(() => {
    // Esconde splash após 2.5 segundos
    const splashTimer = setTimeout(() => {
      setShowSplash(false);

      const isTutorialDisabled = localStorage.getItem('tutorial_disabled') === 'true';
      const isTutorialShownInSession = sessionStorage.getItem('tutorial_shown') === 'true';

      if (!isTutorialDisabled && !isTutorialShownInSession) {
        setShowTutorial(true);
      }
    }, 2500);

    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    if (!showSplash && !showTutorial) {
      fetchConfig();
      fetchStatus();

      // Intervalo mais rápido se estiver extraindo (2s), senão 15s
      const intervalTime = isScraping ? 2000 : 15000;
      const interval = setInterval(() => {
        fetchListings();
        fetchStatus();
      }, intervalTime);
      return () => clearInterval(interval);
    }
  }, [filter, showSplash, showTutorial, isScraping]);

  const API_BASE_URL = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'))
    ? 'http://localhost:7860'
    : (window.location.hostname.includes('vercel.app')
      ? 'https://olx-12ntim1b.b4a.app'
      : ''); // Monolito (mesmo domínio)



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

        // Inteligência para manter o estado de scraping e monitor
        const msg = data.message?.toLowerCase() || '';
        const isError = msg.includes('erro') || msg.includes('bloqueio') || msg.includes('cloudflare');

        if (data.progress > 0 && data.progress < 100) {
          setIsScraping(true);
          setShowMonitor(true);
        } else if (data.progress === 100) {
          setIsScraping(false);
          // Se tiver links, garante que o monitor apareça (mesmo após refresh)
          if (data.links?.length > 0) setShowMonitor(true);
        } else if (isError) {
          setIsScraping(false);
          setShowMonitor(true); // Se teve erro, trava o monitor aberto
        } else if (data.progress === 0) {
          const isStarting = msg.includes('iniciando') || msg.includes('verificando') || msg.includes('conectando');
          if (isStarting) {
            setIsScraping(true);
            setShowMonitor(true);
          } else {
            setIsScraping(false);
            // Se tiver links de uma extração recém-finalizada, mantém aberto
            if (data.links?.length > 0) setShowMonitor(true);
            // Removida lógica de fechamento automático para evitar que suma da tela
          }
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
        id: item.objectId || item.id,
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
    // Carrega filtros do scraper
    try {
      const res = await fetch(`${API_BASE_URL}/api/scraper-filters`);
      if (res.ok) {
        const f = await res.json();
        setScraperFilters(f);
      }
    } catch (e) {
      console.error("Error fetching scraper filters:", e);
    }
  };

  const saveScraperFilters = async (newFilters) => {
    setScraperFilters(newFilters);
    try {
      await fetch(`${API_BASE_URL}/api/scraper-filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFilters)
      });
    } catch (e) {
      console.error("Error saving scraper filters:", e);
    }
  };

  const toggleRegion = (region) => {
    const newRegions = scraperFilters.regions.includes(region)
      ? scraperFilters.regions.filter(r => r !== region)
      : [...scraperFilters.regions, region];
    if (newRegions.length === 0) return; // pelo menos 1
    saveScraperFilters({ ...scraperFilters, regions: newRegions });
  };

  const toggleType = (type) => {
    const newTypes = scraperFilters.types.includes(type)
      ? scraperFilters.types.filter(t => t !== type)
      : [...scraperFilters.types, type];
    if (newTypes.length === 0) return; // pelo menos 1
    saveScraperFilters({ ...scraperFilters, types: newTypes });
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
    setShowMonitor(true); // Abre o monitor imediatamente ao clicar
    try {
      const runLimit = limitEnabled ? parseInt(limit) : 999;
      const response = await fetch(`${API_BASE_URL}/api/run-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: runLimit, filters: scraperFilters })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao iniciar');
      }

      const regioes = scraperFilters.regions.join(', ');
      const tipos = scraperFilters.types.join(', ');
      // Removido alert para não travar o monitor
      console.log(`Scraper iniciado: ${regioes} | ${tipos}`);
    } catch (error) {
      console.error("Erro ao disparar scraper:", error);
      alert("Erro ao disparar scraper: " + error.message);
    } finally {
      // Removido o timeout que resetava o estado erroneamente
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

  const filteredListings = listings
    .filter(l =>
      l.get("price")?.toLowerCase().includes(search.toLowerCase()) ||
      l.get("link")?.toLowerCase().includes(search.toLowerCase()) ||
      (l.get("notes") || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const getDate = (obj) => {
        const val = obj.get("capturedAt") || obj.get("lastUpdated");
        if (!val) return new Date(0);
        if (typeof val === 'string') return new Date(val);
        if (val && typeof val === 'object' && val.iso) return new Date(val.iso);
        return val;
      };
      return getDate(b) - getDate(a);
    });

  return (
    <div className="container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <AnimatePresence>
        {showSplash && <SplashScreen version={APP_VERSION} />}
        {showTutorial && (
          <TutorialStep
            step={tutorialStep}
            onNext={(skipForever) => {
              if (tutorialStep < 2) setTutorialStep(tutorialStep + 1);
              else {
                setShowTutorial(false);
                sessionStorage.setItem('tutorial_shown', 'true');
                if (skipForever) localStorage.setItem('tutorial_disabled', 'true');
              }
            }}
            onSkip={(skipForever) => {
              setShowTutorial(false);
              sessionStorage.setItem('tutorial_shown', 'true');
              if (skipForever) localStorage.setItem('tutorial_disabled', 'true');
            }}
          />
        )}
      </AnimatePresence>

      {!showSplash && !showTutorial && (
        <>
          {/* Header */}
          <header className="header" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
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
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="glass"
                style={{
                  padding: '10px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: showFilters ? 'white' : 'var(--text-muted)',
                  background: showFilters ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                  border: showFilters ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.5px'
                }}
              >
                <Search size={14} />
                FILTROS
                {(scraperFilters.regions.length < 3 || scraperFilters.types.length < 2) && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                )}
              </button>

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

          {/* Painel de Filtros do Scraper */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="glass"
                style={{ marginBottom: '25px', padding: '20px', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <h4 style={{ marginBottom: '16px', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--primary)' }}>
                  ⚙️ Configuração da Busca
                </h4>

                <div className="filters-grid">
                  {/* Regiões */}
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📍 Regiões</p>
                    {[{ id: 'alphaville', label: 'Alphaville', color: '#6366f1' }, { id: 'tambore', label: 'Tamboré', color: '#f59e0b' }, { id: 'barueri', label: 'Barueri', color: '#10b981' }].map(r => (
                      <label key={r.id} onClick={() => toggleRegion(r.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer', background: scraperFilters.regions.includes(r.id) ? `${r.color}22` : 'rgba(255,255,255,0.03)', border: `1px solid ${scraperFilters.regions.includes(r.id) ? r.color + '55' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.2s' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '5px', background: scraperFilters.regions.includes(r.id) ? r.color : 'transparent', border: `2px solid ${scraperFilters.regions.includes(r.id) ? r.color : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', transition: 'all 0.2s' }}>
                          {scraperFilters.regions.includes(r.id) ? '✓' : ''}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: scraperFilters.regions.includes(r.id) ? 'white' : 'var(--text-muted)' }}>{r.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Tipo + Preço */}
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏠 Tipo de Negócio</p>
                    {[{ id: 'venda', label: 'Venda', color: '#6366f1' }, { id: 'aluguel', label: 'Aluguel', color: '#f43f5e' }].map(t => (
                      <label key={t.id} onClick={() => toggleType(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer', background: scraperFilters.types.includes(t.id) ? `${t.color}22` : 'rgba(255,255,255,0.03)', border: `1px solid ${scraperFilters.types.includes(t.id) ? t.color + '55' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.2s' }}>
                        <span style={{ width: '18px', height: '18px', borderRadius: '5px', background: scraperFilters.types.includes(t.id) ? t.color : 'transparent', border: `2px solid ${scraperFilters.types.includes(t.id) ? t.color : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', transition: 'all 0.2s' }}>
                          {scraperFilters.types.includes(t.id) ? '✓' : ''}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: scraperFilters.types.includes(t.id) ? 'white' : 'var(--text-muted)' }}>{t.label}</span>
                      </label>
                    ))}

                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Faixa de Preço (Venda)</p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={scraperFilters.priceMin}
                        onChange={e => saveScraperFilters({ ...scraperFilters, priceMin: parseInt(e.target.value) })}
                        style={{ flex: 1, background: 'var(--bg-dark)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px', fontSize: '0.8rem' }}
                      >
                        {[1000000, 2000000, 3000000, 5000000, 10000000].map(v => <option key={v} value={v}>R$ {(v / 1000000).toFixed(0)}M</option>)}
                      </select>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>até</span>
                      <select
                        value={scraperFilters.priceMax}
                        onChange={e => saveScraperFilters({ ...scraperFilters, priceMax: parseInt(e.target.value) })}
                        style={{ flex: 1, background: 'var(--bg-dark)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px', fontSize: '0.8rem' }}
                      >
                        {[5000000, 10000000, 20000000, 30000000, 50000000].map(v => <option key={v} value={v}>R$ {(v / 1000000).toFixed(0)}M</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Resumo visual */}
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(99,102,241,0.08)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.15)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  🔍 Buscando: <b style={{ color: 'white' }}>{scraperFilters.regions.join(', ')}</b> · Tipo: <b style={{ color: 'white' }}>{scraperFilters.types.join(', ')}</b>{scraperFilters.types.includes('venda') && <> · Preço: <b style={{ color: 'white' }}>R${(scraperFilters.priceMin / 1000000).toFixed(0)}M – R${(scraperFilters.priceMax / 1000000).toFixed(0)}M</b></>} · Apenas particulares
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
            {showMonitor && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="glass"
                style={{ marginBottom: '25px', padding: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--primary)', position: 'relative' }}
              >
                {/* Botão para fechar o monitor manualmente */}
                {!isScraping && (
                  <button
                    onClick={() => setShowMonitor(false)}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}

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
          <div style={{ marginBottom: '25px' }}>
            <div style={{ position: 'relative', marginBottom: '15px' }}>
              <Search style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input
                type="text"
                placeholder="Pesquisar links, preços ou notas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '45px', height: '50px', fontSize: '1rem' }}
              />
            </div>

            <div className="glass" style={{ display: 'flex', padding: '5px', gap: '5px', flexWrap: 'wrap' }}>
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
                    textTransform: 'capitalize',
                    minWidth: '100px'
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
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function SplashScreen({ version }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-dark)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{
          width: '80px', height: '80px', background: 'linear-gradient(135deg, var(--primary), var(--accent))',
          borderRadius: '22px', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(99, 102, 241, 0.5)'
        }}>
          <RefreshCw size={40} color="white" className="spin" />
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '5px' }}>OpenHouses Pro</h1>
        <p style={{ color: 'var(--primary)', fontWeight: 700, letterSpacing: '2px' }}>V {version}</p>
        <div style={{ marginTop: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando seus dados...</div>
      </motion.div>
    </motion.div>
  );
}

function TutorialStep({ step, onNext, onSkip }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const steps = [
    {
      title: "🚀 Bem-vido ao OpenHouses!",
      content: "Este robô monitora a OLX de Alphaville e arredores para encontrar as melhores oportunidades de imóveis direto com proprietários.",
      icon: <RefreshCw size={32} color="white" />
    },
    {
      title: "📋 Gestão de Anúncios",
      content: "Você pode favoritar imóveis, adicionar notas pessoais e ignorar o que não interessa. Itens ignorados não aparecem mais nas extrações.",
      icon: <Star size={32} color="white" />
    },
    {
      title: "📱 WhatsApp & Agendamento",
      content: "Conecte seu WhatsApp para receber o resumo diário. Use o calendário para agendar quando o robô deve rodar automaticamente.",
      icon: <Smartphone size={32} color="white" />
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
      }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass"
        style={{ maxWidth: '450px', width: '100%', padding: '40px', textAlign: 'center' }}
      >
        <div style={{
          width: '64px', height: '64px', background: 'var(--primary)', borderRadius: '16px',
          margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {steps[step].icon}
        </div>
        <h2 style={{ marginBottom: '15px', fontWeight: 800 }}>{steps[step].title}</h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '30px' }}>{steps[step].content}</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer' }} onClick={() => setDontShowAgain(!dontShowAgain)}>
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={() => { }}
            style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Não mostrar mais nas próximas vezes</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => onSkip(dontShowAgain)}
            style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Pular Tudo
          </button>
          <button
            onClick={() => onNext(dontShowAgain)}
            style={{ flex: 2, padding: '12px', borderRadius: '10px', background: 'var(--primary)', color: 'white', fontWeight: 800 }}
          >
            {step === 2 ? "Finalizar" : "Próximo"}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '20px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: i === step ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ListingCard({ listing, onUpdate }) {
  const [note, setNote] = useState(listing.get("notes") || "");
  const [showNote, setShowNote] = useState(false);

  const price = listing.get("price");
  const phone = listing.get("phone");
  const contactName = listing.get("contactName");
  const isIgnored = listing.get("status") === 'ignored';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass"
      style={{
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        borderLeft: isIgnored ? '4px solid #f43f5e' : (listing.get("isFavorite") ? '4px solid #f59e0b' : '4px solid transparent')
      }}
    >
      {/* Preço (se não for N/A) */}
      {price && price !== 'N/A' && (
        <div style={{ minWidth: '110px', fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>
          {price}
        </div>
      )}

      {/* Telefone e Info Imóvel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Título (se houver) */}
        {listing.get("title") && (
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
            {listing.get("title")}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href={`tel:${phone ? phone.replace(/\D/g, '') : ''}`}
            style={{
              color: 'var(--text-main)',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.05)',
              padding: '6px 14px',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <Smartphone size={16} color="var(--primary)" />
            {phone}
          </a>

          {/* Tags região e tipo */}
          {listing.get('region') && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px', padding: '3px 8px', borderRadius: '6px',
              background: listing.get('region') === 'alphaville' ? 'rgba(99,102,241,0.25)' : listing.get('region') === 'tambore' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)',
              color: listing.get('region') === 'alphaville' ? '#818cf8' : listing.get('region') === 'tambore' ? '#fbbf24' : '#34d399',
              textTransform: 'uppercase'
            }}>
              {listing.get('region') === 'alphaville' ? 'Alphaville' : listing.get('region') === 'tambore' ? 'Tamboré' : 'Barueri'}
            </span>
          )}
          {listing.get('listingType') && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px', padding: '3px 8px', borderRadius: '6px',
              background: listing.get('listingType') === 'venda' ? 'rgba(99,102,241,0.2)' : 'rgba(244,63,94,0.2)',
              color: listing.get('listingType') === 'venda' ? '#a5b4fc' : '#fb7185',
              textTransform: 'uppercase'
            }}>
              {listing.get('listingType') === 'venda' ? 'VENDA' : 'ALUGUEL'}
            </span>
          )}

          {/* Badges de Detalhes */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
            {listing.get("rooms") && (
              <span title="Quartos" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Home size={14} /> {listing.get("rooms").replace(/\D/g, '')}
              </span>
            )}
            {listing.get("area") && (
              <span title="Área" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Maximize size={14} /> {listing.get("area")}
              </span>
            )}
            {listing.get("garage") && (
              <span title="Vagas" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layout size={14} /> {listing.get("garage").replace(/\D/g, '')}
              </span>
            )}
            {listing.get("condo") && (
              <span title="Condomínio" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                Cond: {listing.get("condo")}
              </span>
            )}
          </div>
        </div>

        {/* Localização, Contato e Data */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.7rem' }}>
          {listing.get("location") && (
            <span style={{ color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> {listing.get("location").split(',').slice(0, 2).join(',')}
            </span>
          )}

          <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>
            {(() => {
              const capDate = listing.get("capturedAt") || listing.get("lastUpdated");
              if (!capDate) return '-';
              let isoStr = '';
              if (typeof capDate === 'string') isoStr = capDate;
              else if (capDate && typeof capDate === 'object' && capDate.iso) isoStr = capDate.iso;

              if (isoStr) {
                const dt = DateTime.fromISO(isoStr);
                return dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '-';
              }
              const dtJS = DateTime.fromJSDate(capDate);
              return dtJS.isValid ? dtJS.toFormat('dd/MM/yyyy HH:mm') : '-';
            })()}
          </span>

          {(contactName && contactName !== 'Desconhecido') && (
            <span style={{ color: 'var(--primary)', fontWeight: 600, opacity: 0.6 }}>
              • {contactName}
            </span>
          )}
        </div>
      </div>

      {/* Link OLX Minimalista */}
      <a
        href={listing.get("link")}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir no OLX"
        style={{
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '0.8rem',
          textDecoration: 'none',
          padding: '6px'
        }}
      >
        <ExternalLink size={16} />
      </a>

      {/* Ações Rápidas */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setShowNote(!showNote)}
          style={{
            background: showNote ? 'var(--primary)' : 'transparent',
            color: showNote ? 'white' : 'var(--text-muted)',
            padding: '6px'
          }}
          title="Ver Notas"
        >
          <MessageSquare size={18} />
        </button>

        <button
          onClick={() => onUpdate(listing, { isFavorite: !listing.get("isFavorite") })}
          style={{
            background: 'transparent',
            color: listing.get("isFavorite") ? '#f59e0b' : 'var(--text-muted)',
            padding: '6px'
          }}
          title="Favoritar"
        >
          <Star fill={listing.get("isFavorite") ? "#f59e0b" : "none"} size={20} />
        </button>

        <button
          onClick={() => onUpdate(listing, { status: isIgnored ? 'active' : 'ignored' })}
          style={{
            background: 'transparent',
            color: isIgnored ? 'var(--accent)' : 'var(--text-muted)',
            padding: '6px'
          }}
          title={isIgnored ? "Restaurar" : "Ignorar"}
        >
          {isIgnored ? <RefreshCw size={18} /> : <Archive size={18} />}
        </button>
      </div>

      {/* Área de Notas Expansível */}
      <AnimatePresence>
        {showNote && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '250px', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            style={{
              position: 'absolute',
              right: '220px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: 'var(--bg-dark)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '10px',
              borderRadius: '10px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <textarea
              rows="2"
              placeholder="Notas..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ fontSize: '0.8rem', width: '100%', background: 'rgba(255,255,255,0.05)' }}
            />
            <button
              onClick={() => {
                onUpdate(listing, { notes: note });
                setShowNote(false);
              }}
              style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '5px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700
              }}
            >
              SALVAR
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
