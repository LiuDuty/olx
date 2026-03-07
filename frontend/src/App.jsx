import React, { useState, useEffect, useMemo } from 'react';
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
  Smartphone,
  XCircle,
  FileText,
  Activity,
  Plus,
  Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

const APP_VERSION = "2.1.1"; // Versão atual para controle de release

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
  const [scheduledTime, setScheduledTime] = useState('07:00');
  const [schedules, setSchedules] = useState([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [limit, setLimit] = useState(3);
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentRequestId, setCurrentRequestId] = useState(null);
  const [subFilter, setSubFilter] = useState('all');
  const [scraperFilters, setScraperFilters] = useState({
    regions: ['alphaville', 'tambore', 'barueri'],
    types: ['venda'],
    priceMin: 1000000,
    priceMax: 50000000,
    priceMinAluguel: 1000,
    priceMaxAluguel: 50000
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
      fetchListings(); // Chamada inicial ou quando o filtro muda

      const interval = setInterval(() => {
        fetchListings(true); // Chamada silenciosa para o background
        fetchStatus();
      }, isScraping ? 2500 : 15000);
      return () => clearInterval(interval);
    }
  }, [showSplash, showTutorial, filter, isScraping]);

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
        } else if (data.progress === 100) {
          setIsScraping(false);
        } else if (isError) {
          setIsScraping(false);
        } else if (data.progress === 0) {
          const isStarting = msg.includes('iniciando') || msg.includes('verificando') || msg.includes('conectando');
          if (isStarting) {
            setIsScraping(true);
          } else {
            setIsScraping(false);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const fetchListings = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
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
        if (data.schedules) setSchedules(data.schedules);
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
      setCurrentRequestId(requestRef.id);

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

  const cancelScraper = async () => {
    if (!currentRequestId) return;
    try {
      setIsScraping(false);
      // Sinalizar cancelamento no Firestore
      const requestRef = doc(db, "requests", currentRequestId);
      await updateDoc(requestRef, { status: 'cancelled' });

      const statusRef = doc(db, "system", "status");
      await setDoc(statusRef, {
        message: "🔴 EXTRAÇÃO CANCELADA PELO USUÁRIO",
        progress: 0,
        lastUpdate: new Date()
      }, { merge: true });

      setCurrentRequestId(null);
      console.log("Extração cancelada pelo usuário.");
    } catch (error) {
      console.error("Erro ao cancelar scraper:", error);
    }
  };

  const addSchedule = async () => {
    if (schedules.includes(scheduledTime)) return;
    const newSchedules = [...schedules, scheduledTime].sort();
    setSchedules(newSchedules);
    try {
      const docRef = doc(db, "system", "filters");
      await setDoc(docRef, { schedules: newSchedules }, { merge: true });
    } catch (e) {
      console.error("Erro ao salvar:", e);
    }
  };

  const removeSchedule = async (timeToRemove) => {
    const newSchedules = schedules.filter(t => t !== timeToRemove);
    setSchedules(newSchedules);
    try {
      const docRef = doc(db, "system", "filters");
      await setDoc(docRef, { schedules: newSchedules }, { merge: true });
    } catch (e) {
      console.error("Erro ao remover:", e);
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

  const getPropertyType = (l) => {
    const t = String(l.get("title") || "").toLowerCase();
    if (t.includes("casa") || t.includes("sobrado") || t.includes("mansão")) return "Casa";
    if (t.includes("apartamento") || t.includes("apto") || t.includes("flat") || t.includes("studio")) return "Apartamento";
    if (t.includes("terreno") || t.includes("lote")) return "Terreno";
    if (t.includes("comercial") || t.includes("sala") || t.includes("escritório") || t.includes("loja")) return "Comercial";
    if (t.includes("chácara") || t.includes("sítio") || t.includes("fazenda")) return "Rural";
    return "Outros";
  };

  const filteredListings = listings
    .filter(l => {
      if (!l) return false;

      // Filtro de Texto (Busca)
      const s = String(search || "").toLowerCase();
      const p = String(l.get("price") || "").toLowerCase();
      const lnk = String(l.get("link") || "").toLowerCase();
      const n = String(l.get("notes") || "").toLowerCase();
      const t = String(l.get("title") || "").toLowerCase();
      const matchesSearch = p.includes(s) || lnk.includes(s) || n.includes(s) || t.includes(s);

      if (!matchesSearch) return false;

      // Filtro de Categoria (Sub-filtro)
      if (subFilter !== 'all' && (filter === 'vendas' || filter === 'aluguel')) {
        const type = getPropertyType(l);
        if (type !== subFilter) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const getVal = (obj) => {
        const d = toDate(obj.get("capturedAt") || obj.get("lastUpdated"));
        return d ? d.getTime() : 0;
      };
      return getVal(b) - getVal(a);
    });

  const availableSubFilters = useMemo(() => {
    if (filter !== 'all' && filter !== 'vendas' && filter !== 'aluguel') return [];

    const types = new Set();
    listings.forEach(l => {
      // Se for 'all', mostramos tipos de tudo. Se for vendas/aluguel, só daquela categoria.
      if (filter === 'all' || l.get("listingType") === (filter === 'vendas' ? 'venda' : 'aluguel')) {
        types.add(getPropertyType(l));
      }
    });
    const sortedTypes = Array.from(types).sort();
    return sortedTypes.length > 0 ? ['all', ...sortedTypes] : [];
  }, [listings, filter]);

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
          {/* Header e Dashboard Fixos */}
          <div className="sticky-controls">
            <header className="glass-header" style={{ marginBottom: '15px' }}>
              <div className="logo-section">
                <h1 className="logo-text">OpenHouses</h1>
                <div className="agenda-badge" style={{ marginTop: '5px' }}>
                  <Clock size={12} />
                  <span>
                    {schedules.length > 0 ? (
                      `DIÁRIO: ${schedules.length} horários`
                    ) : 'Sem agendamento'}
                  </span>
                </div>
              </div>

              <button
                onClick={handleClearDatabase}
                title="Apagar Toda a Base"
                className="action-btn"
                style={{
                  background: 'rgba(244, 63, 94, 0.05)',
                  border: '1px solid rgba(244, 63, 94, 0.15)',
                  color: 'var(--accent)',
                  padding: '10px',
                  borderRadius: '12px'
                }}
              >
                <Trash2 size={18} />
              </button>
            </header>

            {/* DASHBOARD DE CONTROLE */}
            <div className="dashboard-grid glass" style={{ marginBottom: '15px', padding: '10px' }}>
              <div className="dashboard-item">
                <button
                  onClick={() => {
                    setShowFilters(!showFilters);
                    setShowCalendar(false);
                    setShowMonitor(false);
                  }}
                  className={`control-btn ${showFilters ? 'active' : ''}`}
                >
                  <div className="icon-circle"><Search size={18} /></div>
                  <div className="btn-label">
                    <span>Busca</span>
                    <small>{scraperFilters.regions.length} Regiões • {scraperFilters.types.length} Tipos</small>
                  </div>
                  <ChevronRight size={16} style={{
                    transform: showFilters ? 'rotate(90deg)' : 'none',
                    transition: '0.3s',
                    color: showFilters ? 'white' : 'var(--text-muted)'
                  }} />
                </button>
              </div>

              <div className="dashboard-item">
                <button
                  onClick={() => {
                    setShowCalendar(!showCalendar);
                    setShowFilters(false);
                    setShowMonitor(false);
                  }}
                  className={`control-btn ${showCalendar ? 'active' : ''}`}
                >
                  <div className="icon-circle"><Calendar size={18} /></div>
                  <div className="btn-label">
                    <span>Agenda</span>
                    <small>{schedules.length > 0 ? `${schedules.length} Horários` : 'Configurar Horário'}</small>
                  </div>
                </button>
              </div>

              <div className="dashboard-item">
                <button
                  onClick={() => {
                    setShowMonitor(!showMonitor);
                    setShowFilters(false);
                    setShowCalendar(false);
                  }}
                  className={`control-btn ${showMonitor ? 'active' : ''}`}
                >
                  <div className="icon-circle" style={{ background: isScraping ? 'var(--accent)' : 'rgba(255,255,255,0.08)' }}>
                    <Activity size={18} className={isScraping ? 'spin' : ''} />
                  </div>
                  <div className="btn-label">
                    <span>Monitor</span>
                    <small>{isScraping ? 'Extraindo...' : 'Ver Status Live'}</small>
                  </div>
                </button>
              </div>

              <div className="dashboard-item limit-panel">
                <div className="control-btn no-pointer">
                  <div className="icon-circle" onClick={() => {
                    const newState = !limitEnabled;
                    setLimitEnabled(newState);
                    saveConfig('limit_enabled', newState);
                  }} style={{ background: limitEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                    <Smartphone size={18} style={{ color: 'white' }} />
                  </div>
                  <div className="btn-label">
                    <span>Limite</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <input
                        type="number"
                        value={limit}
                        disabled={!limitEnabled}
                        onChange={(e) => {
                          setLimit(e.target.value);
                          saveConfig('limit_value', e.target.value);
                        }}
                        className="inline-input"
                      />
                      <small>anúncios</small>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Painéis de Configuração (Movidos para cima) */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="glass"
                  style={{ marginBottom: '15px', padding: '20px', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)' }}
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
                      {scraperFilters.types.includes('venda') && (
                        <div style={{ marginTop: '14px' }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Faixa (Venda)</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select
                              value={scraperFilters.priceMin}
                              onChange={e => saveScraperFilters({ ...scraperFilters, priceMin: parseInt(e.target.value) })}
                              style={{ flex: 1, background: 'var(--bg-dark)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px', fontSize: '0.8rem' }}
                            >
                              {[500000, 1000000, 2000000, 3000000, 5000000, 10000000].map(v => <option key={v} value={v}>R$ {(v / 1000000).toFixed(1)}M</option>)}
                            </select>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>atê</span>
                            <select
                              value={scraperFilters.priceMax}
                              onChange={e => saveScraperFilters({ ...scraperFilters, priceMax: parseInt(e.target.value) })}
                              style={{ flex: 1, background: 'var(--bg-dark)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '6px', fontSize: '0.8rem' }}
                            >
                              {[1000000, 5000000, 10000000, 20000000, 30000000, 50000000, 100000000].map(v => <option key={v} value={v}>R$ {(v / 1000000).toFixed(0)}M</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="glass"
                  style={{ marginBottom: '15px', padding: '15px', overflow: 'hidden', maxWidth: '320px', margin: '0 auto 15px' }}
                >
                  <div className="calendar-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Horários Diários</span>
                      <button onClick={() => setShowCalendar(false)} style={{ background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>

                    <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      {schedules && schedules.map(time => (
                        <div key={time} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.12)', padding: '6px 12px', borderRadius: '100px', border: '1px solid rgba(99, 102, 241, 0.2)', color: 'white', fontSize: '0.8rem', fontWeight: 700 }}>
                          <Clock size={12} /> {time}
                          <button onClick={() => removeSchedule(time)} style={{ background: 'transparent', display: 'flex', alignItems: 'center', color: '#f43f5e', padding: 0, marginLeft: '4px' }}>
                            <XCircle size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', width: '100%', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '12px', alignItems: 'center' }}>
                      <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '0.95rem', fontWeight: 800, flex: 1, outline: 'none' }} />
                      <button onClick={addSchedule} style={{ background: 'var(--primary)', color: 'white', padding: '8px 15px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800 }}><Plus size={14} /></button>
                    </div>

                    <button onClick={() => { runScraper(); setShowCalendar(false); }} style={{ width: '100%', background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '10px', borderRadius: '12px', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Activity size={16} /> Extrair Agora
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showMonitor && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="glass"
                  style={{ marginBottom: '15px', padding: '20px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--primary)', position: 'relative' }}
                >
                  {!isScraping && (
                    <button onClick={() => setShowMonitor(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(255,255,255,0.05)', color: 'white', border: 'none', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase' }}>Monitor Extracão Live</span>
                    <span style={{ fontSize: '0.9rem', color: 'white' }}>{liveStatus.progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '15px' }}>
                    <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} animate={{ width: `${liveStatus.progress}%` }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.95rem', color: 'white' }}>{liveStatus.message}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="search-tabs-container" style={{ margin: '15px 0 10px 0' }}>
              <div className="search-bar" style={{ marginBottom: '10px' }}>
                <Search className="search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Preço, bairro, notas ou link..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', border: 'none' }}>
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="tabs-nav" style={{ marginBottom: '10px' }}>
                {[
                  { id: 'active', label: 'Todos', icon: <Layout size={14} /> },
                  { id: 'vendas', label: 'Vendas', icon: <Home size={14} /> },
                  { id: 'aluguel', label: 'Aluguel', icon: <RefreshCw size={14} /> },
                  { id: 'favorites', label: 'Favoritos', icon: <Star size={14} /> },
                  { id: 'ignored', label: 'Trabalhados', icon: <Archive size={14} /> }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setFilter(t.id);
                      setSubFilter('all');
                    }}
                    className={filter === t.id ? 'active' : ''}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {availableSubFilters.length > 0 && (
                <div className="sub-tabs-nav" style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  padding: '5px 0 10px 0',
                  scrollbarWidth: 'none'
                }}>
                  {availableSubFilters.map(type => (
                    <button
                      key={type}
                      onClick={() => setSubFilter(type)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.65rem',
                        borderRadius: '100px',
                        whiteSpace: 'nowrap',
                        background: subFilter === type ? 'var(--primary)' : 'rgba(255,255,255,0.03)',
                        color: subFilter === type ? 'white' : 'var(--text-muted)',
                        border: `1px solid ${subFilter === type ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`,
                        fontWeight: 800,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        transition: '0.2s'
                      }}
                    >
                      {type === 'all' ? 'TUDO' : type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}


      {/* Container de Resultados - Estilo Dashboard */}
      <div className="glass" style={{ padding: '25px', borderRadius: '24px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '8px', height: '18px', background: 'var(--primary)', borderRadius: '4px' }} />
            Descobertas Recentes
          </h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.05)' }}>
            {filteredListings.length} REGISTROS
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <RefreshCw size={40} className="spin" style={{ color: 'var(--primary)', marginBottom: '20px', opacity: 0.5 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>SINCRONIZANDO COM A BASE...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div style={{ padding: '100px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <div style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.03)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Search size={24} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'white' }}>Nenhum anúncio encontrado</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '280px', margin: '0 auto' }}>
              Tente remover os termos de busca ou mudar a aba de filtros.
            </p>
          </div>
        ) : (
          <div className="listings-grid">
            <AnimatePresence mode="popLayout">
              {filteredListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  onUpdate={handleUpdateListing}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

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
        position: 'fixed', inset: 0, zIndex: 9999, background: '#030712',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {/* Background Decorative Elements */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, 90, 0],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        style={{
          position: 'absolute', width: '600px', height: '600px',
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
          filter: 'blur(100px)', zIndex: 0
        }}
      />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ textAlign: 'center', zIndex: 1, position: 'relative' }}
      >
        <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 30px' }}>
          {/* Outer Ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{
              position: 'absolute', inset: 0,
              border: '2px dashed rgba(99, 102, 241, 0.3)',
              borderRadius: '50%'
            }}
          />

          {/* Main Icon Container */}
          <motion.div
            initial={{ scale: 0.5, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #6366f1, #f43f5e)',
              borderRadius: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(99, 102, 241, 0.4)',
              position: 'relative', zIndex: 2
            }}
          >
            <Home size={60} color="white" />
          </motion.div>

          {/* Floating Sparkles */}
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{
                y: [-10, 10, -10],
                x: [-10, 10, -10],
                opacity: [0, 1, 0]
              }}
              transition={{ duration: 2 + i, repeat: Infinity, delay: i * 0.5 }}
              style={{
                position: 'absolute', width: '8px', height: '8px',
                background: 'white', borderRadius: '50%',
                top: `${20 + i * 30}%`, left: `${10 + i * 40}%`,
                boxShadow: '0 0 10px white'
              }}
            />
          ))}
        </div>

        <motion.h1
          initial={{ letterSpacing: "10px", opacity: 0 }}
          animate={{ letterSpacing: "4px", opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
          style={{ fontSize: '2.8rem', fontWeight: 900, marginBottom: '10px', color: 'white' }}
        >
          OPENHOUSES
        </motion.h1>

        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.5, delay: 0.5 }}
          style={{ height: '2px', background: 'linear-gradient(90deg, transparent, var(--primary), transparent)', margin: '0 auto 15px', maxWidth: '200px' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.8rem', background: 'rgba(99, 102, 241, 0.1)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            V {version}
          </span>
        </div>

        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ marginTop: '30px', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase' }}
        >
          Conectando Oportunidades...
        </motion.p>
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
      title: "⏰ Agendamento Recorrente",
      content: "Configure múltiplos horários para o robô rodar automaticamente todos os dias, mantendo sua base sempre atualizada.",
      icon: <Clock size={32} color="white" />
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

const ListingCard = React.memo(({ listing, onUpdate }) => {
  const [note, setNote] = useState(listing.get("notes") || "");
  const [showNote, setShowNote] = useState(false);

  const price = listing.get("price");
  const isIgnored = listing.get("status") === 'ignored';
  const capDate = listing.get("capturedAt") || listing.get("lastUpdated");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, borderColor: 'rgba(99, 102, 241, 0.4)' }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`glass listing-card ${isIgnored ? 'ignored' : ''} ${listing.get("isFavorite") ? 'favorite' : ''}`}
      style={{ padding: '12px', gap: '10px', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Compact Thumbnail on Left */}
        <div style={{
          width: '90px',
          height: '90px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '10px',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          {listing.get("thumbnail") ? (
            <img src={listing.get("thumbnail")} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Home size={28} style={{ color: 'rgba(255,255,255,0.08)' }} />
          )}
        </div>

        {/* Compact Info on Right */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="listing-card-price" style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10b981', margin: 0 }}>
              {price && price !== 'N/A' ? price : 'Consulte'}
            </div>
            {listing.get("isFavorite") && <Star size={14} fill="#f59e0b" style={{ color: '#f59e0b' }} />}
          </div>

          <div className="listing-title" style={{
            fontSize: '0.82rem',
            margin: 0,
            lineHeight: '1.3',
            maxHeight: '2.6em',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            color: 'rgba(255,255,255,0.9)'
          }}>
            {listing.get("title")}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
            {listing.get("rooms") && listing.get("rooms") !== 'N/D' && (
              <div className="badge" style={{ padding: '1px 6px', fontSize: '0.65rem', borderRadius: '4px' }}>
                {String(listing.get("rooms")).replace(/\D/g, '')}Q
              </div>
            )}
            {listing.get("area") && listing.get("area") !== 'N/D' && (
              <div className="badge" style={{ padding: '1px 6px', fontSize: '0.65rem', borderRadius: '4px' }}>
                {listing.get("area")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact Actions Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '2px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>
          <MapPin size={10} style={{ color: 'var(--primary)' }} />
          <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.8)' }}>
            {String(listing.get("location") || 'Alphaville').split(',')[0]}
          </span>
          <span style={{ opacity: 0.3 }}>•</span>
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>
            {(() => {
              if (!capDate) return '';
              const dt = capDate.toDate ? DateTime.fromJSDate(capDate.toDate()) : DateTime.fromJSDate(new Date(capDate));
              return dt.isValid ? dt.toFormat('dd/MM HH:mm') : '';
            })()}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onUpdate(listing, { isFavorite: !listing.get("isFavorite") })}
            style={{
              color: listing.get("isFavorite") ? '#f59e0b' : 'rgba(255,255,255,0.6)',
              background: listing.get("isFavorite") ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${listing.get("isFavorite") ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)'}`,
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = listing.get("isFavorite") ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)';
            }}
          >
            <Star size={15} fill={listing.get("isFavorite") ? "#f59e0b" : "none"} />
          </button>

          <button
            onClick={() => onUpdate(listing, { status: isIgnored ? 'active' : 'ignored' })}
            style={{
              color: isIgnored ? '#f43f5e' : 'rgba(255,255,255,0.6)',
              background: isIgnored ? 'rgba(244, 63, 94, 0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isIgnored ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.06)'}`,
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = isIgnored ? 'rgba(244, 63, 94, 0.1)' : 'rgba(255,255,255,0.03)';
            }}
          >
            {isIgnored ? <RefreshCw size={15} /> : <XCircle size={15} />}
          </button>

          <button
            onClick={() => setShowNote(!showNote)}
            style={{
              color: note ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
              background: note ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${note ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.06)'}`,
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = note ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.03)';
            }}
          >
            <FileText size={15} />
          </button>

          <a
            href={listing.get("link")}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--primary)',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
            }}
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Ultra Compact Note Tooltip/Overlay */}
      <AnimatePresence>
        {showNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', width: '100%' }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota..."
              rows={2}
              style={{ padding: '6px', fontSize: '0.75rem', width: '100%', marginTop: '5px', background: 'rgba(0,0,0,0.2)' }}
            />
            <button
              onClick={() => {
                onUpdate(listing, { notes: note });
                setShowNote(false);
              }}
              style={{
                width: '100%',
                marginTop: '4px',
                background: 'var(--primary)',
                color: 'white',
                padding: '5px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.7rem'
              }}
            >
              SALVAR NOTA
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export default App;
