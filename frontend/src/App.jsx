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
  User,
  Calendar,
  Copy,
  Maximize,
  MapPin,
  X,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CalendarBox from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

// Import Firebase
import { db } from './firebase_config';
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  writeBatch
} from "firebase/firestore";

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
      fetchListings(); // <--- CHAMADA IMEDIATA PARA NÃO FICAR PRESO NO LOADING

      // Intervalo mais rápido se estiver extraindo (2s), senão 15s
      const intervalTime = isScraping ? 2000 : 15000;
      const interval = setInterval(() => {
        fetchListings();
        fetchStatus();
      }, intervalTime);
      return () => clearInterval(interval);
    }
  }, [filter, showSplash, showTutorial, isScraping]);

  const fetchStatus = async () => {
    try {
      const docRef = doc(db, "system", "status");
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setLiveStatus({
          message: data.message || 'Aguardando...',
          progress: data.progress || 0,
          currentItem: data.currentItem || null,
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
          if (data.links?.length > 0) setShowMonitor(true);
        } else if (isError) {
          setIsScraping(false);
          setShowMonitor(true);
        } else if (data.progress === 0) {
          const isStarting = msg.includes('iniciando') || msg.includes('verificando') || msg.includes('conectando');
          if (isStarting) {
            setIsScraping(true);
            setShowMonitor(true);
          } else {
            setIsScraping(false);
            if (data.links?.length > 0) setShowMonitor(true);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const fetchListings = async () => {
    try {
      setLoading(true);
      console.log("⚡ [Firebase] Iniciando busca de anúncios...");
      const listingsRef = collection(db, "listings");
      // Buscamos os itens sem filtros complexos para evitar erro de índice no Firestore
      const querySnapshot = await getDocs(listingsRef);
      console.log(`✅ [Firebase] ${querySnapshot.size} documentos recebidos.`);
      const results = [];
      querySnapshot.forEach((doc) => {
        const item = doc.data();
        results.push({
          id: doc.id,
          get: (field) => item[field],
          set: (field, value) => { item[field] = value },
          data: item // guardamos o objeto puro para facilitar filtros
        });
      });

      // Filtramos e Ordenamos no JavaScript (consome mais memória mas evita erro de índice)
      const filtered = results.filter(item => {
        const isIgnored = item.data.status === 'ignored';
        if (filter === 'ignored') return isIgnored;
        if (isIgnored) return false; // Nas outras abas, nunca mostrar ignorados

        if (filter === 'favorites') return item.data.isFavorite === true;
        if (filter === 'vendas') return item.data.listingType === 'venda';
        if (filter === 'aluguel') return item.data.listingType === 'aluguel';

        return true; // Aba 'active' (Todos)
      });

      setListings(filtered);
    } catch (error) {
      console.error("❌ [Firebase] Erro ao buscar anúncios:", error);
    } finally {
      setLoading(false);
      console.log("🏁 [Frontend] Ciclo de carregamento finalizado.");
    }
  };

  const toDate = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
  };

  const fetchConfig = async () => {
    try {
      const docRef = doc(db, "system", "filters");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setScraperFilters(data);
        if (data.next_run) setNextRun(data.next_run);
        if (data.limit_value) setLimit(data.limit_value);
        if (data.limit_enabled !== undefined) setLimitEnabled(data.limit_enabled);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const saveScraperFilters = async (newFilters) => {
    setScraperFilters(newFilters);
    try {
      const docRef = doc(db, "system", "filters");
      await setDoc(docRef, newFilters, { merge: true });
    } catch (e) {
      console.error("Error saving scraper filters:", e);
    }
  };

  const toggleRegion = (region) => {
    const newRegions = scraperFilters.regions.includes(region)
      ? scraperFilters.regions.filter(r => r !== region)
      : [...scraperFilters.regions, region];
    if (newRegions.length === 0) return;
    saveScraperFilters({ ...scraperFilters, regions: newRegions });
  };

  const toggleType = (type) => {
    const newTypes = scraperFilters.types.includes(type)
      ? scraperFilters.types.filter(t => t !== type)
      : [...scraperFilters.types, type];
    if (newTypes.length === 0) return;
    saveScraperFilters({ ...scraperFilters, types: newTypes });
  };

  const saveConfig = async (key, value) => {
    try {
      const docRef = doc(db, "system", "filters");
      await setDoc(docRef, { [key]: value }, { merge: true });
    } catch (error) {
      console.error("Error saving config:", error);
    }
  };

  const handleUpdateListing = async (listing, updates) => {
    try {
      const docRef = doc(db, "listings", listing.id);
      await updateDoc(docRef, updates);
      fetchListings();
    } catch (error) {
      console.error("Error updating listing:", error);
    }
  };

  const runScraper = async () => {
    setIsScraping(true);
    setShowMonitor(true);
    try {
      // Criar um pedido formal de extração
      const requestRef = doc(collection(db, "requests"));
      await setDoc(requestRef, {
        type: 'MANUAL_START',
        requestedAt: new Date(),
        status: 'pending',
        filters: scraperFilters
      });

      console.log(`Pedido de extração enviado: ${requestRef.id}`);

      // Atualiza o status visual para feedback imediato
      const statusRef = doc(db, "system", "status");
      await setDoc(statusRef, {
        message: "Pedido enviado... Aguardando robô local.",
        progress: 0,
        lastUpdate: new Date()
      }, { merge: true });

    } catch (error) {
      console.error("Erro ao disparar scraper:", error);
    }
  };

  const handleSaveSchedule = async () => {
    const [hours, minutes] = scheduledTime.split(':');
    const nextTime = DateTime.fromJSDate(selectedDate).set({
      hour: parseInt(hours),
      minute: parseInt(minutes)
    }).toISO();

    try {
      const docRef = doc(db, "system", "filters");
      await setDoc(docRef, { next_run: nextTime }, { merge: true });

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
      setLoading(true);
      const q = query(collection(db, "listings"));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      alert(`Base limpa com sucesso! ${snapshot.size} registros removidos.`);
      fetchListings();
    } catch (err) {
      console.error("❌ Erro ao limpar base de dados:", err.message);
      alert("Erro ao limpar base: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredListings = listings
    .filter(l => {
      if (!l) return false;
      const s = String(search || "").toLowerCase();
      const p = String(l.get("price") || "").toLowerCase();
      const lnk = String(l.get("link") || "").toLowerCase();
      const n = String(l.get("notes") || "").toLowerCase();
      return p.includes(s) || lnk.includes(s) || n.includes(s);
    })
    .sort((a, b) => {
      const getVal = (obj) => {
        const d = toDate(obj.get("capturedAt") || obj.get("lastUpdated"));
        return d ? d.getTime() : 0;
      };
      return getVal(b) - getVal(a);
    });

  return (
    <div className="container">
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
          <header className="header glass-header">
            <div className="header-info">
              <h1 className="logo-text">
                OpenHouses OLX
              </h1>
              <div className="agenda-badge">
                <Calendar size={14} />
                <span>AGENDADO: {nextRun ? DateTime.fromISO(nextRun).toFormat('dd/MM \'às\' HH:mm') : 'Não agendado'}</span>
              </div>
            </div>

            <div className="header-actions">
              <div className="glass-button-group">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="glass action-btn"
                  style={{
                    color: showFilters ? 'white' : 'var(--text-muted)',
                    background: showFilters ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                    border: showFilters ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Search size={14} />
                  <span>FILTROS</span>
                  {(scraperFilters.regions.length < 3 || scraperFilters.types.length < 2) && (
                    <span className="filter-notification" />
                  )}
                </button>

                <button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="glass action-btn icon-only"
                  style={{
                    color: 'white',
                    background: showCalendar ? 'var(--primary)' : 'rgba(255,255,255,0.05)'
                  }}
                >
                  <Calendar size={18} />
                </button>
              </div>

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
                    style={{
                      position: 'absolute',
                      top: '15px',
                      right: '15px',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    title="Fechar Monitor"
                  >
                    <X size={18} />
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
                  {isScraping ? (
                    <div className="spin" style={{ width: '15px', height: '15px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  ) : (
                    <span style={{ fontSize: '1.2rem' }}>{liveStatus.progress === 100 ? '✅' : 'ℹ️'}</span>
                  )}
                  <span style={{
                    fontSize: '0.95rem',
                    color: liveStatus.progress === 100 ? '#10b981' : 'var(--text-main)',
                    fontWeight: liveStatus.progress === 100 ? 700 : 500
                  }}>
                    {liveStatus.progress === 100
                      ? `FINALIZADO: ${liveStatus.links?.length || 0} imóveis extraídos com sucesso!`
                      : liveStatus.message}
                  </span>
                </div>

                {liveStatus.currentItem && isScraping && (
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

          <div className="search-tabs-container">
            <div className="search-bar glass">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="glass tabs-nav">
              {[
                { id: 'active', label: 'Todos' },
                { id: 'vendas', label: 'Vendas' },
                { id: 'aluguel', label: 'Aluguel' },
                { id: 'favorites', label: 'Favoritos' },
                { id: 'ignored', label: 'Trabalhados' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={filter === t.id ? 'active' : ''}
                >
                  {t.label}
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
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '5px' }}>OpenHouses</h1>
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
      title: "🚀 Bem-vindo ao OpenHouses!",
      content: "Este robô monitora a OLX de Alphaville e arredores para encontrar as melhores oportunidades de imóveis direto com proprietários.",
      icon: <RefreshCw size={32} color="white" />
    },
    {
      title: "📋 Gestão de Anúncios",
      content: "Favoritos, notas pessoais e filtros. Itens ignorados não aparecem mais nas extrações.",
      icon: <Star size={32} color="white" />
    },
    {
      title: "📅 Agendamento",
      content: "Use o calendário para definir quando o robô deve rodar automaticamente na sua base.",
      icon: <Calendar size={32} color="white" />
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`glass listing-card ${isIgnored ? 'ignored' : ''} ${listing.get("isFavorite") ? 'favorite' : ''}`}
    >
      {/* Preço (se não for N/A) */}
      {price && price !== 'N/A' && (
        <div className="listing-card-price" style={{ minWidth: '100px', fontWeight: 800, color: 'var(--success)', fontSize: '1.2rem' }}>
          {price}
        </div>
      )}

      {/* Info Principal */}
      <div className="listing-info">
        {listing.get("title") && (
          <div className="listing-title">
            {listing.get("title")}
          </div>
        )}

        <div className="listing-details-row">
          <a
            href={`tel:${phone ? phone.replace(/\D/g, '') : ''}`}
            className="phone-link"
          >
            <Smartphone size={16} color="var(--primary)" />
            <span>{phone}</span>
          </a>

          {/* Tags região e tipo */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {listing.get('region') && (
              <span className={`badge ${listing.get('region') === 'alphaville' ? 'badge-region-alpha' : listing.get('region') === 'tambore' ? 'badge-region-tambore' : 'badge-region-other'}`}>
                {listing.get('region')}
              </span>
            )}
            {listing.get('listingType') && (
              <span className={`badge ${listing.get('listingType') === 'venda' ? 'badge-type-venda' : 'badge-type-aluguel'}`}>
                {listing.get('listingType')}
              </span>
            )}
          </div>

          {/* Badges de Detalhes */}
          <div className="listing-meta">
            {listing.get("rooms") && (
              <span title="Quartos" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Home size={14} /> {String(listing.get("rooms")).replace(/\D/g, '')}
              </span>
            )}
            {listing.get("area") && (
              <span title="Área" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Maximize size={14} /> {listing.get("area")}
              </span>
            )}
            {listing.get("garage") && (
              <span title="Vagas" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layout size={14} /> {String(listing.get("garage")).replace(/\D/g, '')}
              </span>
            )}
          </div>
        </div>

        {/* Localização, Contato e Data */}
        <div className="listing-location-row">
          {listing.get("location") && (
            <span style={{ color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> {String(listing.get("location")).split(',').slice(0, 2).join(',')}
            </span>
          )}

          <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 500 }}>
            {(() => {
              const capDate = listing.get("capturedAt") || listing.get("lastUpdated");
              if (!capDate) return '-';
              let dt;
              if (capDate && typeof capDate.toDate === 'function') dt = DateTime.fromJSDate(capDate.toDate());
              else if (typeof capDate === 'string') dt = DateTime.fromISO(capDate);
              else if (capDate && capDate.iso) dt = DateTime.fromISO(capDate.iso);
              else dt = DateTime.fromJSDate(new Date(capDate));
              return dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '-';
            })()}
          </span>

          {(contactName && contactName !== 'Desconhecido') && (
            <span style={{ color: 'var(--primary)', fontWeight: 600, opacity: 0.6 }}>
              • {contactName}
            </span>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="listing-card-actions">
        <a
          href={listing.get("link")}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-muted)', padding: '8px' }}
        >
          <ExternalLink size={18} />
        </a>

        <button
          onClick={() => setShowNote(!showNote)}
          style={{ color: showNote ? 'var(--primary)' : 'var(--text-muted)' }}
        >
          <MessageSquare size={18} />
        </button>

        <button
          onClick={() => onUpdate(listing, { isFavorite: !listing.get("isFavorite") })}
          style={{ color: listing.get("isFavorite") ? '#f59e0b' : 'var(--text-muted)' }}
        >
          <Star fill={listing.get("isFavorite") ? "#f59e0b" : "none"} size={20} />
        </button>

        <button
          onClick={() => onUpdate(listing, { status: isIgnored ? 'active' : 'ignored' })}
          style={{ color: isIgnored ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {isIgnored ? <RefreshCw size={18} /> : <Archive size={18} />}
        </button>
      </div>

      {/* Área de Notas Expansível */}
      <AnimatePresence>
        {showNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              position: 'absolute',
              right: '25px', top: '70px',
              zIndex: 10, background: 'var(--bg-dark)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '12px', borderRadius: '14px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px'
            }}
          >
            <textarea
              rows="3"
              placeholder="Notas..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
            <button
              onClick={() => {
                onUpdate(listing, { notes: note });
                setShowNote(false);
              }}
              style={{ background: 'var(--primary)', color: 'white', padding: '8px', borderRadius: '8px', fontWeight: 700 }}
            >
              SALVAR NOTA
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
