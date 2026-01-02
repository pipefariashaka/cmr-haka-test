
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Users, 
  Send, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Mail, 
  Trash2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  LayoutDashboard,
  Settings,
  MoreVertical,
  ArrowUpRight,
  RefreshCw,
  Copy,
  UserPlus,
  Loader2,
  Database,
  Search,
  Check,
  ShieldCheck,
  Globe,
  Maximize2,
  Minimize2,
  Cpu,
  Lock,
  User
} from 'lucide-react';

// --- Configuration ---
const AI_MODEL = 'gemini-3-flash-preview';
// Client ID verificado desde tu consola de Google Cloud
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
  { step: 4, label: 'Cierre de Secuencia', waitDays: 7 },
];

const TEMPLATES = {
  KDM: [
    { subject: "Propuesta de valor tecnológica para [Company]", body: "Hola [ContactName],\n\nTe contacto de HakaLab. He estado siguiendo el crecimiento de [Company] y creo que nuestra experiencia en desarrollo de software de alta escala podría ayudarles a optimizar sus procesos actuales.\n\n¿Tendrías 10 minutos esta semana?\n\nSaludos,\n[MyName]\nHakaLab" },
    { subject: "Re: Propuesta de valor tecnológica para [Company]", body: "Hola [ContactName],\n\nSolo quería dar seguimiento a mi correo anterior. Entiendo que debes estar muy ocupado liderando [Company].\n\nSi el momento no es el adecuado ahora, ¿hay alguien más en tu equipo con quien deba hablar sobre innovación técnica?\n\nQuedo atento,\n[MyName]" },
    { subject: "Ideas para el roadmap técnico de [Company]", body: "Hola [ContactName],\n\nSigo pensando en los retos de [Company]. Te comparto un breve caso de éxito de HakaLab que creo que resuena con lo que están construyendo.\n\n¿Te parecería conversar el próximo martes?\n\nSaludos,\n[MyName]" },
    { subject: "Hasta la próxima - HakaLab", body: "Hola [ContactName],\n\nTe escribo este último correo para cerrar el hilo por ahora. No quiero ser una molestia en tu bandeja de entrada.\n\nÉxito,\n[MyName]" }
  ],
  Referrer: [
    { subject: "Consulta rápida: Alianza estratégica HakaLab", body: "Hola [ContactName],\n\nEspero que todo vaya excelente. Valoro mucho tu red de contactos.\n\nEstamos expandiendo HakaLab y buscamos llegar a empresas que necesiten un partner tecnológico serio.\n\n¿Hablamos?\n\nUn abrazo,\n[MyName]" },
    { subject: "Seguimiento: Referidos HakaLab", body: "Hola [ContactName],\n\n¿Pudiste ver mi correo anterior sobre la red de referidores de HakaLab?\n\nSaludos,\n[MyName]" },
    { subject: "Actualización de HakaLab", body: "Hola [ContactName],\n\nTe comparto las últimas novedades de HakaLab para tu red.\n\nSeguimos en contacto,\n[MyName]" },
    { subject: "Gracias por tu tiempo", body: "Hola [ContactName],\n\nGracias por estar en mi red.\n\nUn saludo,\n[MyName]" }
  ]
};

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('hakalab_leads_v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  
  const [userName, setUserName] = useState(() => localStorage.getItem('hakalab_user_name') || 'Tu Nombre');
  const [view, setView] = useState<'dashboard' | 'leads' | 'settings'>('dashboard');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [isSidecarMode, setIsSidecarMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  
  // Real Google Contacts States
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [realContacts, setRealContacts] = useState<GoogleContact[]>([]);
  const [isFetchingRealContacts, setIsFetchingRealContacts] = useState(false);

  useEffect(() => {
    localStorage.setItem('hakalab_leads_v2', JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('hakalab_user_name', userName);
  }, [userName]);

  const leadsRequiringAction = useMemo(() => {
    const now = new Date();
    return leads.filter(lead => {
      const lastDate = lead.lastActionDate ? new Date(lead.lastActionDate) : new Date(lead.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === lead.currentStep + 1);
      if (!nextStepConfig || lead.status !== 'Active') return false;
      if (lead.currentStep === 0) return true;
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + nextStepConfig.waitDays);
      return nextDate <= now;
    });
  }, [leads]);

  const handleConnectGoogle = () => {
    try {
      if (!(window as any).google) {
        alert("Cargando SDK de Google...");
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
      alert("Error en autenticación. Verifica que el dominio esté en la lista blanca de la consola de Google.");
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

  const deleteLead = (id: string) => {
    if (confirm("¿Eliminar prospecto?")) setLeads(prev => prev.filter(l => l.id !== id));
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
      Estamos en la etapa ${lead.currentStep + 1} del seguimiento comercial. 
      Usa este borrador como base: "${currentTemplate.body}". 
      Hazlo sonar muy humano, empático y directo. Solo devuelve el cuerpo del correo.`;
      
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
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[400px] mx-auto border-x border-slate-800 shadow-2xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-64 border-r border-slate-900 bg-slate-950/60 backdrop-blur-xl p-6 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-12">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/20"><LayoutDashboard size={20} className="text-white" /></div>
            <h1 className="text-lg font-black tracking-tighter text-white uppercase">Haka Tracker</h1>
          </div>
          <div className="space-y-1">
            <NavButton id="dashboard" icon={Calendar} label="Hoy" />
            <NavButton id="leads" icon={Users} label="Base de Leads" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-6 border-t border-slate-900">
            <div className="flex items-center space-x-3 mb-4 px-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-blue-400 border border-slate-700">{userName.charAt(0)}</div>
              <div><p className="text-[10px] font-black text-white truncate w-32">{userName}</p><p className="text-[8px] font-bold text-slate-500 uppercase">Pro Plan</p></div>
            </div>
            <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all group">
              <span className="text-xs font-bold">Modo Gmail</span>
              <Minimize2 size={16} />
            </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-6 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-16' : 'h-24'}`}>
          <div className="flex items-center space-x-3">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-2 bg-slate-900 rounded-lg text-slate-400"><Maximize2 size={16} /></button>}
            <h2 className={`font-black text-white leading-tight ${isSidecarMode ? 'text-sm' : 'text-xl'}`}>
              {view === 'dashboard' ? 'Pendientes' : view === 'leads' ? 'Contactos' : 'Configuración'}
            </h2>
          </div>
          <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg active:scale-95 transition-transform hover:bg-blue-500"><Plus size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {view === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Acciones</p>
                   <p className="text-2xl font-black text-white">{leadsRequiringAction.length}</p>
                 </div>
                 <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Leads</p>
                   <p className="text-2xl font-black text-blue-500">{leads.length}</p>
                 </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Seguimientos Críticos</p>
                {leadsRequiringAction.length === 0 ? (
                  <div className="py-20 text-center bg-slate-900/10 rounded-[2.5rem] border-2 border-slate-900 border-dashed">
                    <CheckCircle2 size={40} className="mx-auto text-slate-800 mb-4" />
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Pipeline Limpio</p>
                    <p className="text-[10px] text-slate-500 mt-2">No tienes correos pendientes por hoy.</p>
                  </div>
                ) : (
                  leadsRequiringAction.map(lead => (
                    <div key={lead.id} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl group shadow-sm hover:border-blue-500/30 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400'}`}>{lead.name.charAt(0)}</div>
                          <div><h4 className="font-bold text-sm text-white">{lead.name}</h4><p className="text-[10px] text-slate-500 font-bold uppercase truncate w-32">{lead.company}</p></div>
                        </div>
                        <div className="px-2 py-0.5 bg-slate-950 rounded border border-slate-800 text-[8px] font-black text-blue-500 uppercase">Etapa {lead.currentStep + 1}</div>
                      </div>
                      <div className="flex space-x-2">
                        <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-indigo-600 h-10 rounded-xl flex items-center justify-center space-x-2 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50">
                          {aiLoading === lead.id ? <Loader2 size={14} className="animate-spin" /> : <><Sparkles size={14} /><span>Personalizar IA</span></>}
                        </button>
                        <button onClick={() => openGmailRaw(lead)} className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"><Send size={16} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-4 animate-in fade-in">
                <div className="relative">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar en la base..." className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="space-y-2">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex items-center justify-between group hover:bg-slate-900/60 transition-all">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${lead.type === 'KDM' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>{lead.name.charAt(0)}</div>
                        <div><p className="text-xs font-bold text-white">{lead.name}</p><p className="text-[9px] text-slate-500 font-bold uppercase">{lead.company} • Paso {lead.currentStep}</p></div>
                      </div>
                      <button onClick={() => deleteLead(lead.id)} className="text-slate-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'settings' && (
            <div className="space-y-8 animate-in fade-in">
              <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl space-y-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 bg-blue-600/10 text-blue-500 rounded-lg"><User size={18} /></div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-white">Perfil de Usuario</h3>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Nombre en Correos</label>
                  <input value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <p className="text-[9px] text-slate-600 mt-2">Este nombre reemplazará el tag <b>[MyName]</b> en todas tus plantillas.</p>
                </div>
              </div>

              <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-emerald-600/10 text-emerald-500 rounded-lg"><Globe size={18} /></div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Google Sync</h3>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${googleToken ? 'bg-emerald-500/20 text-emerald-500' : 'bg-orange-500/20 text-orange-500'}`}>
                    {googleToken ? 'Conectado' : 'Desconectado'}
                  </div>
                </div>
                <button onClick={handleConnectGoogle} className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">
                  {googleToken ? 'Refrescar Conexión' : 'Vincular Google Workspace'}
                </button>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-16 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-4">
            <button onClick={() => setView('dashboard')} className={`p-2 rounded-lg ${view === 'dashboard' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Calendar size={18} /></button>
            <button onClick={() => setView('leads')} className={`p-2 rounded-lg ${view === 'leads' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Users size={18} /></button>
            <button onClick={() => setView('settings')} className={`p-2 rounded-lg ${view === 'settings' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Settings size={18} /></button>
            <button onClick={() => setIsSyncingContacts(true)} className="p-2 text-slate-600 hover:text-blue-500"><Globe size={18} /></button>
          </footer>
        )}
      </main>

      {/* Google Contacts Picker Modal */}
      {isSyncingContacts && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col h-[80vh] overflow-hidden">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div>
                <h3 className="text-xl font-black text-white tracking-tighter">Sincronizar Gmail</h3>
                <p className="text-xs text-slate-500 font-semibold">{googleToken ? 'Elige tus prospectos' : 'Autoriza la aplicación'}</p>
              </div>
              {!googleToken ? (
                <button onClick={handleConnectGoogle} className="bg-white text-black px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center space-x-2 active:scale-95 transition-all">
                  <Lock size={14} /><span>Autorizar Acceso</span>
                </button>
              ) : (
                <div className="relative w-48">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar..." className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs font-bold focus:outline-none" />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {!googleToken ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-10">
                  <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center mb-6 shadow-2xl"><Globe size={32} className="text-slate-600" /></div>
                  <p className="text-slate-400 font-bold mb-2">Seguridad de Workspace</p>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">Conectamos de forma segura con la People API para que puedas importar tus contactos comerciales sin salir de HakaLab.</p>
                </div>
              ) : isFetchingRealContacts ? (
                <div className="h-full flex items-center justify-center flex-col space-y-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">Cargando libreta de direcciones...</p>
                </div>
              ) : (
                realContacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                  <div key={c.id} onClick={() => {
                    const s = new Set(selectedContacts);
                    if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                    setSelectedContacts(s);
                  }} className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${selectedContacts.has(c.id) ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-900/10' : 'bg-slate-800/30 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'}`}>
                    <div className="flex items-center space-x-3">
                      <img src={c.photoUrl} className="w-8 h-8 rounded-lg object-cover" onError={(e) => (e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.name))} />
                      <div><p className="text-xs font-bold text-white leading-tight">{c.name}</p><p className="text-[10px] text-slate-500 font-medium truncate w-40">{c.email}</p></div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedContacts.has(c.id) ? 'bg-blue-500 border-blue-500 scale-110 shadow-lg' : 'border-slate-800'}`}>
                      {selectedContacts.has(c.id) && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedContacts.size > 0 && (
              <div className="p-6 border-t border-slate-800 bg-slate-900 flex space-x-3">
                <button onClick={() => {
                   const toAdd = realContacts.filter(c => selectedContacts.has(c.id)).map(c => ({
                     id: crypto.randomUUID(), name: c.name, email: c.email, company: c.company || 'Unknown', type: 'KDM' as LeadType, status: 'Active' as LeadStatus, currentStep: 0, lastActionDate: null, createdAt: new Date().toISOString()
                   }));
                   setLeads([...toAdd, ...leads]);
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-900/40 hover:bg-blue-500 transition-all active:scale-95">Importar Selección ({selectedContacts.size})</button>
              </div>
            )}
            
            <button onClick={() => setIsSyncingContacts(false)} className="p-4 text-slate-600 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Cerrar</button>
          </div>
        </div>
      )}

      {/* Manual Modal */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 space-y-6">
            <h3 className="text-xl font-black text-white tracking-tighter">Nuevo Lead</h3>
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
            }} className="space-y-4">
              <input required name="name" placeholder="Nombre completo" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input required name="email" type="email" placeholder="Email de contacto" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input required name="company" placeholder="Nombre de la empresa" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select name="type" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold">
                <option value="KDM">Key Decision Maker</option>
                <option value="Referrer">Referidor</option>
              </select>
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest mt-4 shadow-xl shadow-blue-900/30">Registrar e Iniciar</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-600 font-bold uppercase text-[10px] tracking-widest hover:text-slate-400">Cancelar</button>
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
