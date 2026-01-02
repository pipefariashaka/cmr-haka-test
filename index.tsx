
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  Users, 
  Send, 
  Calendar, 
  CheckCircle2, 
  Plus, 
  Mail, 
  Trash2,
  Sparkles,
  LayoutDashboard,
  Settings,
  Search,
  Check,
  Globe,
  Maximize2,
  Minimize2,
  Loader2,
  Lock,
  User,
  Clock,
  AlertTriangle,
  Info,
  ChevronRight,
  TrendingUp,
  ListFilter
} from 'lucide-react';

// --- Configuration ---
const AI_MODEL = 'gemini-3-flash-preview';
const GOOGLE_CLIENT_ID = "238877148826-7o84ng81hvo1lb8fbf2vbktfg4qhqrjr.apps.googleusercontent.com"; 

type LeadType = 'KDM' | 'Referrer';
type LeadStatus = 'Active' | 'Paused' | 'Converted' | 'Lost';

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  type: LeadType;
  status: LeadStatus;
  currentStep: number; 
  lastActionDate: string | null;
  createdAt: string;
}

interface GoogleContact {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  company?: string;
}

const STEPS_CONFIG = [
  { step: 1, label: 'Primer Contacto', waitDays: 0 },
  { step: 2, label: 'Seguimiento 1', waitDays: 2 },
  { step: 3, label: 'Seguimiento 2', waitDays: 4 },
  { step: 4, label: 'Cierre', waitDays: 7 },
];

const TEMPLATES = {
  KDM: [
    { step: 1, title: "Presentación HakaLab", subject: "Propuesta de valor tecnológica para [Company]", body: "Hola [ContactName],\n\nTe contacto de HakaLab. He estado siguiendo el crecimiento de [Company] y creo que nuestra experiencia en desarrollo de software de alta escala podría ayudarles a optimizar sus procesos actuales.\n\n¿Tendrías 10 minutos esta semana?\n\nSaludos,\n[MyName]\nHakaLab" },
    { step: 2, title: "Seguimiento Corto", subject: "Re: Propuesta de valor tecnológica para [Company]", body: "Hola [ContactName],\n\nSolo quería dar seguimiento a mi correo anterior. Entiendo que debes estar muy ocupado liderando [Company].\n\nSi el momento no es el adecuado ahora, ¿hay alguien más en tu equipo con quien deba hablar sobre innovación técnica?\n\nQuedo atento,\n[MyName]" },
    { step: 3, title: "Valor Agregado", subject: "Ideas para el roadmap técnico de [Company]", body: "Hola [ContactName],\n\nSigo pensando en los retos de [Company]. Te comparto un breve caso de éxito de HakaLab que creo que resuena con lo que están construyendo.\n\n¿Te parecería conversar el próximo martes?\n\nSaludos,\n[MyName]" },
    { step: 4, title: "Despedida / Breakup", subject: "Hasta la próxima - HakaLab", body: "Hola [ContactName],\n\nTe escribo este último correo para cerrar el hilo por ahora. No quiero ser una molestia en tu bandeja de entrada.\n\nÉxito,\n[MyName]" }
  ],
  Referrer: [
    { step: 1, title: "Alianza Estratégica", subject: "Consulta rápida: Alianza estratégica HakaLab", body: "Hola [ContactName],\n\nEspero que todo vaya excelente. Valoro mucho tu red de contactos.\n\nEstamos expandiendo HakaLab y buscamos llegar a empresas que necesiten un partner tecnológico serio.\n\n¿Hablamos?\n\nUn abrazo,\n[MyName]" },
    { step: 2, title: "Follow-up Referido", subject: "Seguimiento: Referidos HakaLab", body: "Hola [ContactName],\n\n¿Pudiste ver mi correo anterior sobre la red de referidores de HakaLab?\n\nSaludos,\n[MyName]" },
    { step: 3, title: "Novedades HakaLab", subject: "Actualización de HakaLab", body: "Hola [ContactName],\n\nTe comparto las últimas novedades de HakaLab para tu red.\n\nSeguimos en contacto,\n[MyName]" },
    { step: 4, title: "Cierre de Red", subject: "Gracias por tu tiempo", body: "Hola [ContactName],\n\nGracias por estar en mi red.\n\nUn saludo,\n[MyName]" }
  ]
};

// Fallback para IDs únicos
const generateId = () => {
  try { return crypto.randomUUID(); } 
  catch { return Math.random().toString(36).substr(2, 9); }
};

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('hakalab_leads_v5');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [userName, setUserName] = useState(() => localStorage.getItem('hakalab_user_name') || 'Tu Nombre');
  const [view, setView] = useState<'dashboard' | 'leads' | 'templates' | 'settings'>('dashboard');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [isSidecarMode, setIsSidecarMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [realContacts, setRealContacts] = useState<GoogleContact[]>([]);
  const [isFetchingRealContacts, setIsFetchingRealContacts] = useState(false);

  useEffect(() => {
    localStorage.setItem('hakalab_leads_v5', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('hakalab_user_name', userName);
  }, [userName]);

  // Agrupar leads para el Dashboard con mayor detalle
  const dashboardData = useMemo(() => {
    const now = new Date();
    const active = leads.filter(l => l.status === 'Active');
    
    return {
      total: leads.length,
      activeCount: active.length,
      newLeads: active.filter(l => l.currentStep === 0),
      // Tareas HOY (vencidas o para hoy)
      todayTasks: active.filter(l => {
        if (l.currentStep === 0) return false;
        if (l.currentStep >= 4) return false;
        
        const lastDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
        const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
        if (!nextStepConfig) return false;

        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + nextStepConfig.waitDays);
        return nextDate <= now;
      }),
      // En espera (próximos días)
      upcoming: active.filter(l => {
        if (l.currentStep === 0) return false;
        if (l.currentStep >= 4) return false;
        
        const lastDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
        const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
        if (!nextStepConfig) return false;

        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + nextStepConfig.waitDays);
        return nextDate > now;
      })
    };
  }, [leads]);

  const handleConnectGoogle = () => {
    try {
      if (!(window as any).google || !(window as any).google.accounts) {
        alert("Google SDK no detectado. Revisa tu conexión.");
        return;
      }
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/contacts.readonly',
        callback: (response: any) => {
          if (response.access_token) {
            setGoogleToken(response.access_token);
            fetchRealContacts(response.access_token);
          }
        },
      });
      client.requestAccessToken();
    } catch (err) {
      alert("Error en la conexión con Google.");
    }
  };

  const fetchRealContacts = async (token: string) => {
    setIsFetchingRealContacts(true);
    try {
      const response = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,photos,organizations&pageSize=150', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const mapped = (data.connections || []).map((conn: any) => ({
        id: conn.resourceName,
        name: conn.names?.[0]?.displayName || "Sin nombre",
        email: conn.emailAddresses?.[0]?.value || "Sin email",
        photoUrl: conn.photos?.[0]?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conn.names?.[0]?.displayName || 'U')}&background=random`,
        company: conn.organizations?.[0]?.name || "Individual"
      }));
      setRealContacts(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingRealContacts(false);
    }
  };

  const advanceStep = (leadId: string) => {
    setLeads(prev => prev.map(l => {
      if (l.id === leadId) {
        const nextStep = l.currentStep + 1;
        return {
          ...l,
          currentStep: nextStep,
          lastActionDate: new Date().toISOString(),
          status: nextStep >= 4 ? 'Converted' : 'Active' as LeadStatus
        };
      }
      return l;
    }));
  };

  const openGmailRaw = (lead: Lead) => {
    const currentTemplate = TEMPLATES[lead.type][lead.currentStep] || TEMPLATES[lead.type][0];
    const subject = currentTemplate.subject.replace('[Company]', lead.company);
    const body = currentTemplate.body
      .replace('[ContactName]', lead.name)
      .replace('[Company]', lead.company)
      .replace('[MyName]', userName);
    
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    advanceStep(lead.id);
  };

  const generateAIEmail = async (lead: Lead) => {
    setAiLoading(lead.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentTemplate = TEMPLATES[lead.type][lead.currentStep];
      const prompt = `Actúa como un experto en ventas B2B. Soy ${userName} de HakaLab. Escribe un correo para ${lead.name} de ${lead.company}. 
      Secuencia: Paso ${lead.currentStep + 1} de 4. Borrador base: "${currentTemplate.body}". 
      Hazlo sonar muy humano, corto y directo. Solo devuelve el cuerpo del correo.`;
      
      const response = await ai.models.generateContent({ model: AI_MODEL, contents: prompt });
      const body = response.text || currentTemplate.body;
      const subject = currentTemplate.subject.replace('[Company]', lead.company);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
      advanceStep(lead.id);
    } catch (err) { 
      openGmailRaw(lead);
    } finally { setAiLoading(null); }
  };

  const NavButton = ({ id, icon: Icon, label }: { id: typeof view, icon: any, label: string }) => (
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${view === id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <Icon size={18} />
      {!isSidecarMode && <span className="font-semibold text-sm">{label}</span>}
    </button>
  );

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[420px] mx-auto border-x border-slate-800 shadow-2xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-64 border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl p-6 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-12">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/40"><LayoutDashboard size={20} className="text-white" /></div>
            <h1 className="text-lg font-black tracking-tighter text-white uppercase">Haka Tracker</h1>
          </div>
          <div className="space-y-2">
            <NavButton id="dashboard" icon={Calendar} label="Dashboard" />
            <NavButton id="leads" icon={Users} label="Base de Leads" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-6 border-t border-slate-900 space-y-4">
             <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Empresa</p>
                <p className="text-xs font-bold text-white truncate">HakaLab Engine</p>
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all">
                <span className="text-xs font-bold">Modo Sidebar</span>
                <Minimize2 size={16} />
             </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-8 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-16' : 'h-24'}`}>
          <div className="flex items-center space-x-3">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-2 bg-slate-900 rounded-lg text-slate-400"><Maximize2 size={16} /></button>}
            <h2 className="font-black text-white text-2xl tracking-tight uppercase italic">
              {view === 'dashboard' ? 'Overview' : view === 'leads' ? 'Mis Leads' : view === 'templates' ? 'Emails' : 'Settings'}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl items-center space-x-3">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase leading-none">Total Leads</p>
                <p className="text-sm font-black text-white">{dashboardData.total}</p>
              </div>
              <TrendingUp size={16} className="text-blue-500" />
            </div>
            <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg hover:bg-blue-500 transition-all active:scale-95 flex items-center space-x-2">
              <Plus size={18} />
              <span className="text-xs font-black uppercase tracking-widest hidden sm:inline">Nuevo Lead</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {view === 'dashboard' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Sección Listos para Iniciar */}
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Sparkles size={18} className="text-blue-400" />
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Nuevos Prospectos ({dashboardData.newLeads.length})</h3>
                  </div>
                  {dashboardData.newLeads.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 uppercase tracking-widest">Requiere Acción</span>
                  )}
                </div>

                {dashboardData.newLeads.length === 0 ? (
                  <div className="bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-[2.5rem] p-12 text-center flex flex-col items-center">
                    <Users size={32} className="text-slate-700 mb-4" />
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">Sin prospectos nuevos por iniciar</p>
                    <button onClick={() => setIsSyncingContacts(true)} className="mt-6 flex items-center space-x-2 text-blue-500 hover:text-blue-400 transition-colors">
                      <Globe size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Importar desde Google</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {dashboardData.newLeads.map(lead => (
                      <div key={lead.id} className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl flex items-center justify-between group hover:border-blue-500/50 hover:bg-slate-900/60 transition-all">
                        <div className="flex items-center space-x-5">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400'} border border-white/5 shadow-inner`}>{lead.name.charAt(0)}</div>
                          <div>
                            <h4 className="font-black text-white text-base tracking-tight">{lead.name}</h4>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center space-x-2">
                              <span>{lead.company}</span>
                              <span className="text-slate-800">•</span>
                              <span className={lead.type === 'KDM' ? 'text-blue-500' : 'text-amber-500'}>{lead.type}</span>
                            </p>
                          </div>
                        </div>
                        <button onClick={() => openGmailRaw(lead)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center space-x-3 shadow-xl active:scale-95 transition-all">
                          <Send size={16} />
                          <span>Mandar Paso 1</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Sección Seguimientos HOY */}
              <section className="space-y-6">
                <div className="flex items-center space-x-3">
                  <Clock size={18} className="text-amber-400" />
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Seguimientos para Hoy ({dashboardData.todayTasks.length})</h3>
                </div>
                {dashboardData.todayTasks.length === 0 ? (
                  <div className="bg-slate-900/10 border border-slate-900 rounded-[2rem] p-8 text-center">
                    <CheckCircle2 size={24} className="mx-auto text-slate-800 mb-2" />
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Al día con los seguimientos</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {dashboardData.todayTasks.map(lead => (
                      <div key={lead.id} className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2.5rem] group hover:border-amber-500/30 transition-all flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-sm">{lead.name.charAt(0)}</div>
                            <div>
                              <h4 className="font-bold text-white text-sm">{lead.name}</h4>
                              <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Paso {lead.currentStep + 1} de 4</p>
                            </div>
                          </div>
                          <div className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-2 py-1 rounded-lg border border-amber-500/20 uppercase tracking-widest">Toca hoy</div>
                        </div>
                        <div className="flex space-x-2">
                          <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-indigo-600 h-12 rounded-2xl flex items-center justify-center space-x-2 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-900/20">
                            {aiLoading === lead.id ? <Loader2 size={16} className="animate-spin" /> : <><Sparkles size={16} /><span>Personalizar IA</span></>}
                          </button>
                          <button onClick={() => openGmailRaw(lead)} className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-all"><Send size={20} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Sección Pipeline (Upcoming) */}
              {dashboardData.upcoming.length > 0 && (
                <section className="space-y-6 pt-4 border-t border-slate-900">
                  <div className="flex items-center space-x-3">
                    <ListFilter size={18} className="text-slate-500" />
                    <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">En Secuencia Activa ({dashboardData.upcoming.length})</h3>
                  </div>
                  <div className="grid gap-2">
                    {dashboardData.upcoming.map(lead => (
                      <div key={lead.id} className="p-4 bg-slate-950/50 border border-slate-900 rounded-2xl flex items-center justify-between opacity-60 hover:opacity-100 transition-opacity">
                        <div className="flex items-center space-x-4">
                          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-black text-[10px]">{lead.name.charAt(0)}</div>
                          <div>
                            <p className="text-xs font-bold text-slate-300">{lead.name}</p>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Siguiente: Paso {lead.currentStep + 1}</p>
                          </div>
                        </div>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">En espera de tiempo...</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-6 animate-in fade-in">
                <div className="flex items-center space-x-4">
                   <div className="relative flex-1">
                      <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" />
                      <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar en toda la base de datos..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-5 pl-14 pr-4 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all" />
                   </div>
                   <button onClick={() => setIsSyncingContacts(true)} className="h-14 w-14 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center hover:bg-blue-600/20 transition-all border border-blue-500/10"><Globe size={24} /></button>
                </div>
                <div className="grid gap-3">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-5 bg-slate-900/40 border border-slate-800 rounded-3xl flex items-center justify-between group hover:bg-slate-900/60 transition-all">
                      <div className="flex items-center space-x-5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-500' : 'bg-amber-600/10 text-amber-500'} border border-white/5`}>{lead.name.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-black text-white">{lead.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{lead.company} • {lead.type} • Paso {lead.currentStep}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-1 rounded border uppercase ${lead.status === 'Active' ? 'text-blue-500 border-blue-500/20' : 'text-slate-600 border-slate-800'}`}>{lead.status}</span>
                        <button onClick={() => setLeads(prev => prev.filter(l => l.id !== lead.id))} className="text-slate-800 hover:text-red-500 p-2 transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'templates' && (
            <div className="space-y-12 animate-in fade-in">
               {['KDM', 'Referrer'].map(type => (
                 <div key={type} className="space-y-6">
                    <p className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] px-1">Secuencia {type}</p>
                    <div className="grid gap-6">
                      {TEMPLATES[type as LeadType].map((temp, i) => (
                        <div key={i} className="bg-slate-900/40 border border-slate-800 p-8 rounded-[3rem] space-y-5 shadow-2xl">
                          <div className="flex items-center justify-between">
                            <span className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest">Paso {temp.step} - {temp.title}</span>
                            <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Espera: {STEPS_CONFIG[i].waitDays} d</span>
                          </div>
                          <h4 className="text-base font-black text-white leading-snug">{temp.subject.replace('[Company]', 'Empresa X')}</h4>
                          <div className="p-6 bg-slate-950/50 rounded-2xl border border-white/5">
                            <p className="text-xs text-slate-500 leading-relaxed italic opacity-80 whitespace-pre-wrap">{temp.body.replace('[ContactName]', 'Cliente').replace('[Company]', 'Empresa').replace('[MyName]', userName)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
               ))}
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-10 animate-in fade-in max-w-2xl">
              <div className="p-10 bg-slate-900/40 border border-slate-800 rounded-[3rem] space-y-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl"><User size={28} /></div>
                  <h3 className="text-lg font-black uppercase tracking-tighter text-white">Mi Identidad</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Nombre del Firmante</label>
                    <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej: Felipe Farias" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="p-10 bg-slate-900/40 border border-slate-800 rounded-[3rem] space-y-6">
                <div className="flex items-center space-x-4 text-amber-500">
                  <AlertTriangle size={24} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Google Integration</h3>
                </div>
                <div className="bg-amber-950/20 border border-amber-500/10 p-6 rounded-[2rem] space-y-5">
                  <p className="text-xs text-amber-100/60 leading-relaxed font-medium">Si recibes un error en el login, asegúrate de añadir esta URL a tu consola de Google Cloud:</p>
                  <div className="flex items-center space-x-3 bg-black/40 p-4 rounded-xl border border-white/5">
                    <code className="text-[10px] font-bold text-white truncate flex-1">{window.location.origin}</code>
                    <button onClick={() => { navigator.clipboard.writeText(window.location.origin); alert("Copiado!"); }} className="p-2 text-blue-400 hover:text-white transition-colors"><Info size={18} /></button>
                  </div>
                </div>
                <button onClick={handleConnectGoogle} className="w-full py-5 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-200 transition-all active:scale-95">
                  {googleToken ? 'Cuenta Vinculada ✓' : 'Conectar Google Contacts'}
                </button>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-24 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-4">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center space-y-2 p-4 rounded-[1.5rem] transition-all ${view === 'dashboard' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}>
              <LayoutDashboard size={22} />
              <span className="text-[8px] font-black uppercase tracking-widest">Home</span>
            </button>
            <button onClick={() => setView('leads')} className={`flex flex-col items-center space-y-2 p-4 rounded-[1.5rem] transition-all ${view === 'leads' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}>
              <Users size={22} />
              <span className="text-[8px] font-black uppercase tracking-widest">Leads</span>
            </button>
            <button onClick={() => setView('templates')} className={`flex flex-col items-center space-y-2 p-4 rounded-[1.5rem] transition-all ${view === 'templates' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}>
              <Mail size={22} />
              <span className="text-[8px] font-black uppercase tracking-widest">Mails</span>
            </button>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center space-y-2 p-4 rounded-[1.5rem] transition-all ${view === 'settings' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}>
              <Settings size={22} />
              <span className="text-[8px] font-black uppercase tracking-widest">Ajustes</span>
            </button>
          </footer>
        )}
      </main>

      {/* Modal Importar Contactos */}
      {isSyncingContacts && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col h-[85vh] overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase">Gmail Import</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{googleToken ? 'Selecciona los prospectos' : 'Conecta tu cuenta comercial'}</p>
              </div>
              {!googleToken ? (
                <button onClick={handleConnectGoogle} className="bg-white text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-2xl">Vincular</button>
              ) : (
                <div className="relative w-56">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar..." className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
              {!googleToken ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-12 space-y-8">
                  <div className="w-24 h-24 bg-slate-800 rounded-[2.5rem] flex items-center justify-center shadow-2xl border border-white/5"><Globe size={40} className="text-slate-600" /></div>
                  <div className="space-y-4">
                    <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-xs">Conecta tu Libreta</p>
                    <p className="text-sm text-slate-600 leading-relaxed font-bold">Importaremos los contactos seleccionados para cargar tu pipeline de ventas de HakaLab.</p>
                  </div>
                </div>
              ) : isFetchingRealContacts ? (
                <div className="h-full flex items-center justify-center flex-col space-y-6">
                  <div className="relative w-16 h-16">
                    <Loader2 className="animate-spin text-blue-500 absolute inset-0" size={64} strokeWidth={3} />
                  </div>
                  <p className="text-xs text-slate-600 font-black uppercase tracking-[0.2em]">Escaneando Google Contacts...</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {realContacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                    <div key={c.id} onClick={() => {
                      const s = new Set(selectedContacts);
                      if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                      setSelectedContacts(s);
                    }} className={`p-5 rounded-3xl border cursor-pointer transition-all flex items-center justify-between ${selectedContacts.has(c.id) ? 'bg-blue-600/10 border-blue-500 shadow-xl' : 'bg-slate-800/30 border-slate-800 hover:bg-slate-800/50'}`}>
                      <div className="flex items-center space-x-5">
                        <img src={c.photoUrl} className="w-12 h-12 rounded-2xl border border-white/5 shadow-inner" onError={(e) => (e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.name))} />
                        <div>
                          <p className="text-sm font-black text-white leading-tight tracking-tight">{c.name}</p>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">{c.email}</p>
                        </div>
                      </div>
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${selectedContacts.has(c.id) ? 'bg-blue-500 border-blue-500 scale-110 shadow-xl' : 'border-slate-800'}`}>
                        {selectedContacts.has(c.id) && <Check size={16} className="text-white" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedContacts.size > 0 && (
              <div className="p-10 border-t border-slate-800 bg-slate-900/60 flex space-x-4">
                <button onClick={() => {
                   const toAdd = realContacts.filter(c => selectedContacts.has(c.id)).map(c => ({
                     id: generateId(), 
                     name: c.name, 
                     email: c.email, 
                     company: c.company || 'Empresa', 
                     type: 'KDM' as LeadType, 
                     status: 'Active' as LeadStatus, 
                     currentStep: 0, 
                     lastActionDate: null, 
                     createdAt: new Date().toISOString()
                   }));
                   setLeads(prev => [...toAdd, ...prev]);
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                   setView('dashboard');
                }} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-blue-900/40 hover:bg-blue-500 transition-all">Importar como KDMs ({selectedContacts.size})</button>
                <button onClick={() => {
                   const toAdd = realContacts.filter(c => selectedContacts.has(c.id)).map(c => ({
                     id: generateId(), 
                     name: c.name, 
                     email: c.email, 
                     company: c.company || 'Empresa', 
                     type: 'Referrer' as LeadType, 
                     status: 'Active' as LeadStatus, 
                     currentStep: 0, 
                     lastActionDate: null, 
                     createdAt: new Date().toISOString()
                   }));
                   setLeads(prev => [...toAdd, ...prev]);
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                   setView('dashboard');
                }} className="flex-1 py-5 bg-amber-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-amber-900/40 hover:bg-amber-500 transition-all">Importar como Referidores</button>
              </div>
            )}
            
            <button onClick={() => setIsSyncingContacts(false)} className="p-8 text-slate-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Cancelar Importación</button>
          </div>
        </div>
      )}

      {/* Modal Lead Manual */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center z-50 p-6">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[3rem] shadow-2xl p-12 space-y-10 animate-in zoom-in duration-300">
            <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase">Nuevo Prospecto</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const nl: Lead = {
                id: generateId(),
                name: f.get('name') as string,
                email: f.get('email') as string,
                company: f.get('company') as string,
                type: f.get('type') as LeadType,
                status: 'Active',
                currentStep: 0,
                lastActionDate: null,
                createdAt: new Date().toISOString()
              };
              setLeads(prev => [nl, ...prev]);
              setIsAddingLead(false);
              setView('dashboard');
            }} className="space-y-4">
              <input required name="name" placeholder="Nombre completo" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input required name="email" type="email" placeholder="Email comercial" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input required name="company" placeholder="Nombre de la Empresa" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select name="type" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-6 py-5 text-sm font-bold">
                <option value="KDM">Key Decision Maker (KDM)</option>
                <option value="Referrer">Referidor Estratégico</option>
              </select>
              <button type="submit" className="w-full py-6 bg-blue-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest mt-6 shadow-2xl shadow-blue-900/40 active:scale-95 transition-all">Crear Lead</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-600 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors">Volver</button>
          </div>
        </div>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<HakaTracker />);
}
