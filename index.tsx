
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
  Info
} from 'lucide-react';

// --- Configuration ---
const AI_MODEL = 'gemini-3-flash-preview';
// Client ID extraído de tu captura de pantalla
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

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('hakalab_leads_final');
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
    localStorage.setItem('hakalab_leads_final', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('hakalab_user_name', userName);
  }, [userName]);

  // Lógica de leads agrupados para el Dashboard
  const dashboardData = useMemo(() => {
    const now = new Date();
    const active = leads.filter(l => l.status === 'Active');
    
    return {
      newLeads: active.filter(l => l.currentStep === 0),
      followups: active.filter(l => {
        if (l.currentStep === 0) return false;
        const lastDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
        const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
        if (!nextStepConfig) return false;
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + nextStepConfig.waitDays);
        return nextDate <= now;
      })
    };
  }, [leads]);

  const handleConnectGoogle = () => {
    try {
      if (!(window as any).google || !(window as any).google.accounts) {
        alert("SDK de Google cargando... espera 2 segundos.");
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
      console.error(err);
      alert("Error en el cliente de Google. Revisa la consola.");
    }
  };

  const fetchRealContacts = async (token: string) => {
    setIsFetchingRealContacts(true);
    try {
      const response = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,photos,organizations&pageSize=100', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const mapped = (data.connections || []).map((conn: any) => ({
        id: conn.resourceName,
        name: conn.names?.[0]?.displayName || "Sin nombre",
        email: conn.emailAddresses?.[0]?.value || "Sin email",
        photoUrl: conn.photos?.[0]?.url || `https://ui-avatars.com/api/?name=${encodeURIComponent(conn.names?.[0]?.displayName || 'U')}`,
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
      const prompt = `Soy ${userName} de HakaLab. Escribe un correo para ${lead.name} de ${lead.company}. 
      Secuencia: ${lead.currentStep + 1}/4. Borrador base: "${currentTemplate.body}". 
      Hazlo directo, humano y profesional. Solo devuelve el cuerpo del mensaje.`;
      
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
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${view === id ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <Icon size={18} />
      {!isSidecarMode && <span className="font-semibold text-sm">{label}</span>}
    </button>
  );

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[420px] mx-auto border-x border-slate-800 shadow-2xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-64 border-r border-slate-900 bg-slate-950 p-6 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-12">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/40"><LayoutDashboard size={20} className="text-white" /></div>
            <h1 className="text-lg font-black tracking-tighter text-white uppercase">Haka Tracker</h1>
          </div>
          <div className="space-y-1">
            <NavButton id="dashboard" icon={Calendar} label="Hoy" />
            <NavButton id="leads" icon={Users} label="Prospectos" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-6 border-t border-slate-900 space-y-4">
             <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Usuario</p>
                <p className="text-xs font-bold text-white truncate">{userName}</p>
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all">
                <span className="text-xs font-bold">Modo Sidebar</span>
                <Minimize2 size={16} />
             </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-6 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-16' : 'h-24'}`}>
          <div className="flex items-center space-x-3">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-2 bg-slate-900 rounded-lg text-slate-400"><Maximize2 size={16} /></button>}
            <h2 className="font-black text-white text-xl tracking-tight">
              {view === 'dashboard' ? 'Pendientes' : view === 'leads' ? 'Base de Leads' : view === 'templates' ? 'Secuencias' : 'Ajustes'}
            </h2>
          </div>
          <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-all hover:bg-blue-500"><Plus size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {view === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Sección Listos para Iniciar */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 px-1">
                  <Sparkles size={14} className="text-blue-400" />
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Nuevos / Por Iniciar ({dashboardData.newLeads.length})</p>
                </div>
                {dashboardData.newLeads.length === 0 ? (
                  <div className="bg-slate-900/30 border-2 border-dashed border-slate-900 rounded-[2rem] p-10 text-center">
                    <CheckCircle2 size={32} className="mx-auto text-slate-800 mb-4" />
                    <p className="text-xs font-bold text-slate-700 uppercase">Todo al día</p>
                  </div>
                ) : (
                  dashboardData.newLeads.map(lead => (
                    <div key={lead.id} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-blue-500/50 transition-all shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400'}`}>{lead.name.charAt(0)}</div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{lead.name}</h4>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">{lead.company} • {lead.type}</p>
                        </div>
                      </div>
                      <button onClick={() => openGmailRaw(lead)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center space-x-2 shadow-lg shadow-blue-900/20 active:scale-95 transition-all">
                        <Send size={14} />
                        <span>Iniciar</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Sección Seguimientos */}
              <div className="space-y-4 pt-4 border-t border-slate-900">
                <div className="flex items-center space-x-2 px-1">
                  <Clock size={14} className="text-amber-400" />
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Seguimientos Críticos ({dashboardData.followups.length})</p>
                </div>
                {dashboardData.followups.map(lead => (
                  <div key={lead.id} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl group hover:border-amber-500/30 transition-all shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400'}`}>{lead.name.charAt(0)}</div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{lead.name}</h4>
                          <p className="text-[9px] text-slate-500 font-bold uppercase">{lead.company} • Paso {lead.currentStep + 1}</p>
                        </div>
                      </div>
                      <div className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-2 py-1 rounded border border-amber-500/20 uppercase tracking-wider">Toca Seguimiento</div>
                    </div>
                    <div className="flex space-x-2">
                      <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-indigo-600 h-10 rounded-xl flex items-center justify-center space-x-2 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-50 hover:bg-indigo-500 transition-all">
                        {aiLoading === lead.id ? <Loader2 size={14} className="animate-spin" /> : <><Sparkles size={14} /><span>AI Personalizada</span></>}
                      </button>
                      <button onClick={() => openGmailRaw(lead)} className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all"><Send size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-4 animate-in fade-in">
                <div className="flex items-center space-x-2">
                   <div className="relative flex-1">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar base de datos..." className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                   </div>
                   <button onClick={() => setIsSyncingContacts(true)} className="h-14 w-14 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center hover:bg-blue-600/20 transition-all border border-blue-500/10"><Globe size={20} /></button>
                </div>
                <div className="space-y-2">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-center justify-between group hover:bg-slate-900/60 transition-all">
                      <div className="flex items-center space-x-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400'}`}>{lead.name.charAt(0)}</div>
                        <div>
                          <p className="text-xs font-bold text-white">{lead.name}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase leading-tight">{lead.company} • {lead.type} • Paso {lead.currentStep}</p>
                        </div>
                      </div>
                      <button onClick={() => setLeads(leads.filter(l => l.id !== lead.id))} className="text-slate-800 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'templates' && (
            <div className="space-y-10 animate-in fade-in">
               {['KDM', 'Referrer'].map(type => (
                 <div key={type} className="space-y-4">
                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest px-1">Secuencia de {type}s</h3>
                    <div className="grid gap-4">
                      {TEMPLATES[type as LeadType].map((temp, i) => (
                        <div key={i} className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2rem] space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-black text-slate-400 uppercase">Paso {temp.step} - {temp.title}</span>
                            <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Espera: {STEPS_CONFIG[i].waitDays} d</span>
                          </div>
                          <h4 className="text-sm font-bold text-white leading-snug">{temp.subject.replace('[Company]', 'Nombre Empresa')}</h4>
                          <p className="text-[11px] text-slate-500 leading-relaxed whitespace-pre-wrap italic opacity-80 border-l-2 border-slate-800 pl-4">{temp.body.replace('[ContactName]', 'Cliente').replace('[Company]', 'Empresa').replace('[MyName]', userName)}</p>
                        </div>
                      ))}
                    </div>
                 </div>
               ))}
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-600/10 text-blue-500 rounded-2xl shadow-inner"><User size={24} /></div>
                  <h3 className="text-base font-black uppercase tracking-tighter text-white">Perfil de Ventas</h3>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block px-1">Firma del Remitente</label>
                  <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej. Juan Pérez" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all" />
                </div>
              </div>

              {/* Depurador de OAuth */}
              <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] space-y-4">
                <div className="flex items-center space-x-3 text-amber-500 mb-2">
                  <AlertTriangle size={18} />
                  <h3 className="text-xs font-black uppercase tracking-widest">Diagnóstico de Google OAuth</h3>
                </div>
                <div className="bg-amber-950/20 border border-amber-500/10 p-4 rounded-2xl space-y-3">
                  <p className="text-[10px] text-amber-200/60 leading-relaxed">Si recibes el <b>Error 400: invalid_request</b>, asegúrate de añadir esta URL exacta a los <b>Orígenes de JavaScript autorizados</b> en Google Cloud Console:</p>
                  <div className="flex items-center space-x-2 bg-black/40 p-2 rounded-xl border border-white/5">
                    <code className="text-[10px] font-bold text-white truncate flex-1">{window.location.origin}</code>
                    <button onClick={() => navigator.clipboard.writeText(window.location.origin)} className="p-2 text-blue-400 hover:text-white transition-colors"><Info size={14} /></button>
                  </div>
                </div>
                <button onClick={handleConnectGoogle} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-900/30 transition-all active:scale-95">
                  {googleToken ? 'Cuenta Conectada ✓' : 'Vincular Gmail Contacts'}
                </button>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-24 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-4">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center space-y-1.5 p-3 rounded-2xl transition-all ${view === 'dashboard' ? 'text-blue-500 bg-blue-500/10 shadow-inner' : 'text-slate-600'}`}>
              <Calendar size={20} />
              <span className="text-[9px] font-black uppercase tracking-wider">Hoy</span>
            </button>
            <button onClick={() => setView('leads')} className={`flex flex-col items-center space-y-1.5 p-3 rounded-2xl transition-all ${view === 'leads' ? 'text-blue-500 bg-blue-500/10 shadow-inner' : 'text-slate-600'}`}>
              <Users size={20} />
              <span className="text-[9px] font-black uppercase tracking-wider">Base</span>
            </button>
            <button onClick={() => setView('templates')} className={`flex flex-col items-center space-y-1.5 p-3 rounded-2xl transition-all ${view === 'templates' ? 'text-blue-500 bg-blue-500/10 shadow-inner' : 'text-slate-600'}`}>
              <Mail size={20} />
              <span className="text-[9px] font-black uppercase tracking-wider">Mails</span>
            </button>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center space-y-1.5 p-3 rounded-2xl transition-all ${view === 'settings' ? 'text-blue-500 bg-blue-500/10 shadow-inner' : 'text-slate-600'}`}>
              <Settings size={20} />
              <span className="text-[9px] font-black uppercase tracking-wider">Config</span>
            </button>
          </footer>
        )}
      </main>

      {/* Modal Importar */}
      {isSyncingContacts && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-white tracking-tighter">Gmail Contacts</h3>
                <p className="text-xs text-slate-500 font-bold">{googleToken ? 'Selecciona los prospectos' : 'Autorización requerida'}</p>
              </div>
              {!googleToken ? (
                <button onClick={handleConnectGoogle} className="bg-white text-black px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Vincular</button>
              ) : (
                <div className="relative w-48">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar..." className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold focus:outline-none" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {!googleToken ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-12 space-y-6">
                  <div className="w-20 h-20 bg-slate-800 rounded-[2rem] flex items-center justify-center shadow-2xl"><Globe size={36} className="text-slate-600" /></div>
                  <div className="space-y-2">
                    <p className="text-slate-400 font-black uppercase tracking-widest text-[11px]">Conecta con Workspace</p>
                    <p className="text-xs text-slate-600 leading-relaxed font-bold">Importaremos contactos directamente desde tu cuenta de Google Cloud para automatizar las secuencias comerciales de HakaLab.</p>
                  </div>
                </div>
              ) : isFetchingRealContacts ? (
                <div className="h-full flex items-center justify-center flex-col space-y-4">
                  <Loader2 className="animate-spin text-blue-500" size={40} />
                  <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Sincronizando libreta...</p>
                </div>
              ) : (
                realContacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                  <div key={c.id} onClick={() => {
                    const s = new Set(selectedContacts);
                    if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                    setSelectedContacts(s);
                  }} className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${selectedContacts.has(c.id) ? 'bg-blue-600/10 border-blue-500 shadow-lg' : 'bg-slate-800/30 border-slate-800 hover:bg-slate-800/50'}`}>
                    <div className="flex items-center space-x-3">
                      <img src={c.photoUrl} className="w-9 h-9 rounded-xl border border-white/5" onError={(e) => (e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.name))} />
                      <div>
                        <p className="text-xs font-black text-white leading-tight">{c.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold truncate w-40">{c.email}</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedContacts.has(c.id) ? 'bg-blue-500 border-blue-500 scale-110 shadow-lg shadow-blue-900/40' : 'border-slate-800'}`}>
                      {selectedContacts.has(c.id) && <Check size={14} className="text-white" />}
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedContacts.size > 0 && (
              <div className="p-8 border-t border-slate-800 bg-slate-900/50 flex space-x-3">
                <button onClick={() => {
                   const toAdd = realContacts.filter(c => selectedContacts.has(c.id)).map(c => ({
                     id: crypto.randomUUID(), name: c.name, email: c.email, company: c.company || 'Unknown', type: 'KDM' as LeadType, status: 'Active' as LeadStatus, currentStep: 0, lastActionDate: null, createdAt: new Date().toISOString()
                   }));
                   setLeads([...toAdd, ...leads]);
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-900/40 hover:bg-blue-500 transition-all">Importar como KDMs ({selectedContacts.size})</button>
                <button onClick={() => {
                   const toAdd = realContacts.filter(c => selectedContacts.has(c.id)).map(c => ({
                     id: crypto.randomUUID(), name: c.name, email: c.email, company: c.company || 'Unknown', type: 'Referrer' as LeadType, status: 'Active' as LeadStatus, currentStep: 0, lastActionDate: null, createdAt: new Date().toISOString()
                   }));
                   setLeads([...toAdd, ...leads]);
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                }} className="flex-1 py-4 bg-amber-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-amber-900/40 hover:bg-amber-500 transition-all">Importar Referidores</button>
              </div>
            )}
            
            <button onClick={() => setIsSyncingContacts(false)} className="p-6 text-slate-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Cerrar</button>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 space-y-8 animate-in zoom-in duration-200">
            <h3 className="text-2xl font-black text-white tracking-tighter">Nuevo Lead Manual</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const nl: Lead = {
                id: crypto.randomUUID(),
                name: f.get('name') as string,
                email: f.get('email') as string,
                company: f.get('company') as string,
                type: f.get('type') as LeadType,
                status: 'Active',
                currentStep: 0,
                lastActionDate: null,
                createdAt: new Date().toISOString()
              };
              setLeads([nl, ...leads]);
              setIsAddingLead(false);
              setView('dashboard');
            }} className="space-y-4">
              <input required name="name" placeholder="Nombre completo" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input required name="email" type="email" placeholder="Email" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-5