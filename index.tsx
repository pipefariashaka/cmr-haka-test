
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
// Importaciones directas de ESM para evitar errores de resolución de Rollup/Vite
import { initializeApp } from "https://esm.sh/firebase@10.8.0/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  getDoc,
  Firestore
} from "https://esm.sh/firebase@10.8.0/firestore";

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
  ListFilter,
  RefreshCw,
  MessageSquare,
  CloudUpload,
  Database,
  History,
  ExternalLink,
  CloudOff,
  Save,
  Edit3,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Safe Firestore Initialization
let db: Firestore | null = null;
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (err) {
  console.error("Firebase init failed:", err);
}

// --- Types & Constants ---
const AI_MODEL = 'gemini-3-flash-preview';
const GOOGLE_CLIENT_ID = "238877148826-7o84ng81hvo1lb8fbf2vbktfg4qhqrjr.apps.googleusercontent.com"; 

type LeadType = 'KDM' | 'Referrer';
type LeadStatus = 'Active' | 'Paused' | 'Converted' | 'Lost' | 'Replied';

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

interface ActivityLog {
  id: string;
  leadId: string;
  leadName: string;
  action: string;
  step: number;
  timestamp: string;
}

interface Template {
  step: number;
  title: string;
  subject: string;
  body: string;
}

interface TemplatesConfig {
  KDM: Template[];
  Referrer: Template[];
}

const DEFAULT_TEMPLATES: TemplatesConfig = {
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

const STEPS_CONFIG = [
  { step: 1, label: 'Primer Contacto', waitDays: 0 },
  { step: 2, label: 'Seguimiento 1', waitDays: 2 },
  { step: 3, label: 'Seguimiento 2', waitDays: 4 },
  { step: 4, label: 'Cierre', waitDays: 7 },
];

const generateId = () => {
  try { return crypto.randomUUID(); } 
  catch { return Math.random().toString(36).substr(2, 9); }
};

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [templates, setTemplates] = useState<TemplatesConfig>(DEFAULT_TEMPLATES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [userName, setUserName] = useState(() => localStorage.getItem('hakalab_user_name') || 'Tu Nombre');
  const [view, setView] = useState<'dashboard' | 'leads' | 'templates' | 'settings'>('dashboard');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [isSidecarMode, setIsSidecarMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [realContacts, setRealContacts] = useState<any[]>([]);
  const [isFetchingRealContacts, setIsFetchingRealContacts] = useState(false);
  const [isCheckingGmail, setIsCheckingGmail] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (leads.length > 0) {
      localStorage.setItem('hakalab_leads_v6', JSON.stringify(leads));
    }
  }, [leads]);

  useEffect(() => {
    localStorage.setItem('hakalab_user_name', userName);
  }, [userName]);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      const savedTemplates = localStorage.getItem('hakalab_templates_v1');
      if (savedTemplates) setTemplates(JSON.parse(savedTemplates));

      if (db) {
        const leadsSnap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc")));
        const cloudLeads = leadsSnap.docs.map(doc => doc.data() as Lead);
        if (cloudLeads.length > 0) setLeads(cloudLeads);

        const logsSnap = await getDocs(query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(50)));
        const cloudLogs = logsSnap.docs.map(doc => doc.data() as ActivityLog);
        if (cloudLogs.length > 0) setLogs(cloudLogs);

        const configSnap = await getDoc(doc(db, "config", "templates"));
        if (configSnap.exists()) {
          const cloudTemplates = JSON.parse(configSnap.data().value);
          setTemplates(cloudTemplates);
          localStorage.setItem('hakalab_templates_v1', configSnap.data().value);
        }
      } else {
        const savedLeads = localStorage.getItem('hakalab_leads_v6');
        const savedLogs = localStorage.getItem('hakalab_logs_v6');
        if (savedLeads) setLeads(JSON.parse(savedLeads));
        if (savedLogs) setLogs(JSON.parse(savedLogs));
      }
    } catch (err) {
      console.error("Firestore fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplates = async (newTemplates: TemplatesConfig) => {
    setTemplates(newTemplates);
    localStorage.setItem('hakalab_templates_v1', JSON.stringify(newTemplates));
    if (db) {
      setIsSyncing(true);
      try {
        await setDoc(doc(db, "config", "templates"), {
          value: JSON.stringify(newTemplates),
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Firestore sync templates error:", err);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleTemplateChange = (type: LeadType, index: number, field: 'subject' | 'body', value: string) => {
    const updated = { ...templates };
    updated[type][index][field] = value;
    setTemplates(updated);
  };

  const syncLeadToCloud = async (lead: Lead) => {
    if (!db) return;
    setIsSyncing(true);
    try {
      await setDoc(doc(db, "leads", lead.id), lead);
    } catch (err) {
      console.error("Firestore lead sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const addActivityLog = async (lead: Lead, action: string) => {
    const newLog: ActivityLog = {
      id: generateId(),
      leadId: lead.id,
      leadName: lead.name,
      action: action,
      step: lead.currentStep,
      timestamp: new Date().toISOString()
    };
    setLogs(prev => {
      const updated = [newLog, ...prev.slice(0, 49)];
      localStorage.setItem('hakalab_logs_v6', JSON.stringify(updated));
      return updated;
    });
    if (db) {
      try {
        await setDoc(doc(db, "activity_logs", newLog.id), newLog);
      } catch (err) {
        console.error("Firestore log sync error:", err);
      }
    }
  };

  const deleteLeadFromCloud = async (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (db) {
      setIsSyncing(true);
      try {
        await deleteDoc(doc(db, "leads", id));
      } catch (err) {
        console.error("Firestore delete error:", err);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const dashboardData = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0,0,0,0)).getTime();
    
    const active = leads.filter(l => l.status === 'Active');
    const repliedLeads = leads.filter(l => l.status === 'Replied');
    
    // 1. SE ENVIARÁN HOY (Leads que toca enviar hoy según el waitDays)
    const toSendToday = active.filter(l => {
      if (l.currentStep >= 4) return false;
      const originDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      if (!nextStepConfig) return false;
      
      const nextDueDate = new Date(originDate);
      nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      return nextDueDate <= new Date(); // Ya se cumplió el tiempo
    });

    // 2. ENVIADOS HOY (Logs de hoy con acción 'Email enviado')
    const sentTodayIds = new Set(
      logs
        .filter(log => {
          const logDate = new Date(log.timestamp).getTime();
          return logDate >= todayStart && log.action.includes('Email enviado');
        })
        .map(log => log.leadId)
    );
    const sentTodayLeads = leads.filter(l => sentTodayIds.has(l.id));

    return {
      total: leads.length,
      toSendToday,
      sentToday: sentTodayLeads,
      replied: repliedLeads
    };
  }, [leads, logs]);

  const handleConnectGoogle = (scopes?: string[]) => {
    try {
      if (!(window as any).google || !(window as any).google.accounts) {
        alert("Google SDK no detectado.");
        return;
      }
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: scopes ? scopes.join(' ') : 'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/gmail.readonly',
        callback: (response: any) => {
          if (response.access_token) {
            setGoogleToken(response.access_token);
            if (!scopes) fetchRealContacts(response.access_token);
          }
        },
      });
      client.requestAccessToken();
    } catch (err) {
      console.error(err);
    }
  };

  const checkGmailResponses = async () => {
    if (!googleToken) {
      handleConnectGoogle(['https://www.googleapis.com/auth/gmail.readonly']);
      return;
    }
    setIsCheckingGmail(true);
    let foundAny = false;
    try {
      const activeLeads = leads.filter(l => l.status === 'Active' && l.currentStep > 0);
      for (const lead of activeLeads) {
        const lastAction = lead.lastActionDate ? new Date(lead.lastActionDate) : new Date(lead.createdAt);
        const afterTimestamp = Math.floor(lastAction.getTime() / 1000);
        const queryStr = encodeURIComponent(`from:${lead.email} after:${afterTimestamp}`);
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${queryStr}&maxResults=1`, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });
        const data = await response.json();
        if (data.resultSizeEstimate > 0) {
          foundAny = true;
          const updatedLead = { ...lead, status: 'Replied' as LeadStatus };
          setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));
          await syncLeadToCloud(updatedLead);
          await addActivityLog(lead, 'Respuesta detectada (Gmail)');
        }
      }
      if (!foundAny) alert("No se detectaron nuevas respuestas.");
      else alert("¡Nuevas respuestas marcadas!");
    } catch (err) {
      console.error(err);
    } finally {
      setIsCheckingGmail(false);
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

  const advanceStep = async (leadId: string, actionType: 'Manual' | 'AI') => {
    const leadToUpdate = leads.find(l => l.id === leadId);
    if (!leadToUpdate) return;
    const nextStep = leadToUpdate.currentStep + 1;
    const updatedLead: Lead = {
      ...leadToUpdate,
      currentStep: nextStep,
      lastActionDate: new Date().toISOString(),
      status: nextStep >= 4 ? 'Converted' : 'Active' as LeadStatus
    };
    setLeads(prev => prev.map(l => l.id === leadId ? updatedLead : l));
    await syncLeadToCloud(updatedLead);
    await addActivityLog(updatedLead, `Email enviado (${actionType})`);
  };

  const openGmailRaw = (lead: Lead) => {
    const currentTemplate = templates[lead.type][lead.currentStep] || templates[lead.type][0];
    const subject = currentTemplate.subject.replace('[Company]', lead.company);
    const body = currentTemplate.body
      .replace('[ContactName]', lead.name)
      .replace('[Company]', lead.company)
      .replace('[MyName]', userName);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    advanceStep(lead.id, 'Manual');
  };

  const generateAIEmail = async (lead: Lead) => {
    setAiLoading(lead.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentTemplate = templates[lead.type][lead.currentStep];
      const prompt = `Actúa como un experto en ventas B2B. Soy ${userName} de HakaLab. Escribe un correo para ${lead.name} de ${lead.company}. 
      Secuencia: Paso ${lead.currentStep + 1} de 4. Borrador base: "${currentTemplate.body}". 
      Hazlo sonar muy humano, corto y directo. Solo devuelve el cuerpo del correo. Mantén los corchetes si no sabes la información.`;
      const response = await ai.models.generateContent({ model: AI_MODEL, contents: prompt });
      const body = response.text || currentTemplate.body;
      const subject = currentTemplate.subject.replace('[Company]', lead.company);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
      advanceStep(lead.id, 'AI');
    } catch (err) { 
      openGmailRaw(lead);
    } finally { setAiLoading(null); }
  };

  const NavButton = ({ id, icon: Icon, label }: { id: typeof view, icon: any, label: string }) => (
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-lg transition-all ${view === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <Icon size={14} />
      {!isSidecarMode && <span className="font-semibold text-[10px] uppercase tracking-wider">{label}</span>}
    </button>
  );

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[380px] mx-auto border-x border-slate-800 shadow-2xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-48 border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl p-3.5 flex flex-col z-20">
          <div className="flex items-center space-x-2 mb-8 px-1">
            <div className="bg-blue-600 p-1 rounded-lg"><LayoutDashboard size={14} className="text-white" /></div>
            <h1 className="text-[10px] font-black tracking-tighter text-white uppercase italic">Haka Tracker</h1>
          </div>
          <div className="space-y-0.5">
            <NavButton id="dashboard" icon={Calendar} label="Dashboard" />
            <NavButton id="leads" icon={Users} label="Prospectos" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-4 border-t border-slate-900 space-y-2">
             <button onClick={checkGmailResponses} className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 transition-all group ${isCheckingGmail ? 'opacity-50 pointer-events-none' : ''}`}>
                <RefreshCw size={12} className={isCheckingGmail ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                <span className="text-[8px] font-black uppercase tracking-widest">Gmail Sync</span>
             </button>
             <div className="px-3 py-1 bg-slate-900 rounded-lg flex items-center justify-between">
                <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Storage</span>
                {db ? <Database size={10} className="text-orange-400" /> : <CloudOff size={10} className="text-amber-500" />}
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all">
                <span className="text-[8px] font-bold uppercase">Sidebar</span>
                <Minimize2 size={10} />
             </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-5 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-10' : 'h-12'}`}>
          <div className="flex items-center space-x-2">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-1 bg-slate-900 rounded-lg text-slate-400"><Maximize2 size={10} /></button>}
            <h2 className="font-black text-white text-sm tracking-tight uppercase italic">
              {view === 'dashboard' ? 'Overview' : view === 'leads' ? 'Base de Leads' : view === 'templates' ? 'Editor Secuencias' : 'Ajustes'}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow hover:bg-blue-500 transition-all active:scale-95 flex items-center space-x-1.5">
              <Plus size={10} />
              <span className="text-[8px] font-black uppercase tracking-widest">Nuevo Lead</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-2">
              <Loader2 size={24} className="text-blue-500 animate-spin" />
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Sincronizando...</p>
            </div>
          ) : view === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
              
              {/* COLUMNA PRINCIPAL (FLUJO DIARIO) */}
              <div className="lg:col-span-2 space-y-4">
                
                {/* SECCIÓN 1: SE ENVIARÁN HOY */}
                <section className="space-y-2">
                  <div className="flex items-center space-x-2 px-1">
                    <Clock size={12} className="text-blue-400" />
                    <h3 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Se enviarán hoy ({dashboardData.toSendToday.length})</h3>
                  </div>
                  {dashboardData.toSendToday.length === 0 ? (
                    <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-xl p-6 text-center">
                      <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">Inbox al día. Sin envíos pendientes.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dashboardData.toSendToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-xl flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-sm">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center space-x-2 overflow-hidden">
                              <div className="w-7 h-7 rounded-lg bg-blue-600/10 flex items-center justify-center font-black text-[9px] text-blue-500 border border-blue-500/10">{lead.name.charAt(0)}</div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-100 text-[11px] tracking-tight truncate">{lead.name}</h4>
                                <p className="text-[7px] text-slate-500 font-black uppercase truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="bg-blue-600/20 text-blue-400 text-[6px] font-black px-1 py-0.5 rounded-md border border-blue-500/20 uppercase">Paso {lead.currentStep + 1}</div>
                          </div>
                          <div className="flex space-x-1">
                            <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-blue-600 h-7 rounded-lg flex items-center justify-center space-x-1 text-white font-black text-[7px] uppercase tracking-widest hover:bg-blue-500 transition-all">
                              {aiLoading === lead.id ? <Loader2 size={10} className="animate-spin" /> : <><Sparkles size={10} /><span>Borrar con IA</span></>}
                            </button>
                            <button onClick={() => openGmailRaw(lead)} className="w-7 h-7 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all"><Send size={10} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* SECCIÓN 2: ENVIADOS HOY */}
                <section className="space-y-2">
                  <div className="flex items-center space-x-2 px-1">
                    <CheckCircle2 size={12} className="text-indigo-400" />
                    <h3 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Enviados hoy ({dashboardData.sentToday.length})</h3>
                  </div>
                  {dashboardData.sentToday.length === 0 ? (
                    <div className="bg-slate-900/20 border border-slate-900 rounded-xl p-4 text-center">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest">No has enviado nada hoy</p>
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      {dashboardData.sentToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/30 border border-slate-800/50 p-2 rounded-lg flex items-center justify-between shadow-sm">
                          <div className="flex items-center space-x-2.5 overflow-hidden">
                            <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center font-black text-[8px] text-indigo-400">{lead.name.charAt(0)}</div>
                            <div className="overflow-hidden">
                              <p className="text-[10px] font-black text-slate-300 truncate leading-none mb-0.5">{lead.name}</p>
                              <p className="text-[7px] text-slate-600 font-bold uppercase truncate">{lead.company} • Secuencia: Etapa {lead.currentStep}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 text-indigo-500">
                             <Check size={8} />
                             <span className="text-[6px] font-black uppercase tracking-tighter">Done</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* COLUMNA LATERAL (RESPUESTAS Y MÉTRICAS) */}
              <div className="space-y-4">
                
                {/* SECCIÓN 3: HAN RESPONDIDO */}
                <section className="space-y-2">
                  <div className="flex items-center space-x-2 px-1">
                    <MessageSquare size={12} className="text-green-400" />
                    <h3 className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Han respondido ({dashboardData.replied.length})</h3>
                  </div>
                  {dashboardData.replied.length === 0 ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center">
                      <p className="text-[8px] font-black text-slate-700 uppercase tracking-widest italic">Sin respuestas pendientes.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {dashboardData.replied.map(lead => (
                        <div key={lead.id} className="bg-white border border-slate-200 p-2.5 rounded-xl flex flex-col justify-between hover:shadow-lg transition-all shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2 overflow-hidden">
                              <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center font-black text-green-600 text-[9px] border border-green-500/10">{lead.name.charAt(0)}</div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-900 text-[10px] tracking-tight truncate leading-none mb-0.5">{lead.name}</h4>
                                <p className="text-[7px] text-slate-500 font-black uppercase truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="p-1 cursor-pointer hover:bg-slate-100 rounded-md transition-colors" onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')}><ExternalLink size={10} className="text-slate-400" /></div>
                          </div>
                          <button onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')} className="w-full py-1.5 bg-green-600 text-white rounded-lg font-black text-[7px] uppercase tracking-widest hover:bg-green-500 transition-all active:scale-95 shadow-md">Ir al Correo</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* MÉTRICAS RÁPIDAS */}
                <section className="p-3.5 bg-indigo-700 text-white rounded-xl space-y-2 shadow-lg shadow-indigo-900/40">
                  <div className="flex justify-between items-end">
                    <span className="text-[7px] font-bold uppercase opacity-80">Conversión</span>
                    <span className="text-lg font-black italic">{dashboardData.total > 0 ? Math.round((dashboardData.replied.length / dashboardData.total) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white transition-all duration-1000" style={{ width: `${dashboardData.total > 0 ? (dashboardData.replied.length / dashboardData.total) * 100 : 0}%` }}></div>
                  </div>
                </section>
              </div>
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-3 animate-in fade-in max-w-2xl mx-auto">
                <div className="relative mb-3">
                   <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar base de prospectos..." className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-4 text-[11px] font-bold text-slate-900 focus:outline-none shadow-sm" />
                </div>
                <div className="grid gap-1.5">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between hover:border-blue-300 transition-all shadow-sm">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black ${lead.type === 'KDM' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{lead.name.charAt(0)}</div>
                        <div className="overflow-hidden">
                          <p className="text-[11px] font-black text-slate-900 leading-none mb-0.5 truncate">{lead.name}</p>
                          <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest truncate">{lead.company} • Paso: {lead.currentStep}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className={`text-[6px] font-black px-1.5 py-0.5 rounded-md border uppercase ${lead.status === 'Active' ? 'text-blue-600 bg-blue-50 border-blue-100' : lead.status === 'Replied' ? 'text-green-600 bg-green-50 border-green-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>{lead.status}</span>
                        <button onClick={() => deleteLeadFromCloud(lead.id)} className="text-slate-300 hover:text-red-500 p-1 bg-slate-50 rounded-md transition-all"><Trash2 size={10} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'templates' && (
            <div className="space-y-6 animate-in fade-in max-w-2xl mx-auto pb-10">
               <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-black text-white italic uppercase tracking-tighter">Gestión de Copys</h3>
                    <p className="text-[7px] text-slate-500 font-black uppercase mt-0.5">Control de contenido secuencial</p>
                  </div>
                  <button onClick={() => saveTemplates(templates)} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black text-[8px] uppercase shadow transition-all active:scale-95">
                    {isSyncing ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                    <span>Guardar Todo</span>
                  </button>
               </div>

               {['KDM', 'Referrer'].map(type => (
                 <div key={type} className="space-y-3">
                    <div className="flex items-center space-x-2 px-1">
                        <div className="w-4 h-0.5 bg-blue-600"></div>
                        <p className="text-[8px] font-black text-white uppercase tracking-[0.2em]">Flow: {type}</p>
                    </div>
                    <div className="grid gap-3">
                      {templates[type as LeadType].map((temp, i) => (
                        <div key={i} className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-sm relative group">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <div className="flex items-center space-x-2">
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded-md text-[7px] font-black text-white uppercase">Paso {temp.step}</span>
                                <h4 className="text-[10px] font-black text-slate-900 uppercase italic tracking-tight">{temp.title}</h4>
                            </div>
                            <div className="flex items-center space-x-1 text-slate-400">
                                <Clock size={8} />
                                <span className="text-[7px] font-black uppercase">Wait: {STEPS_CONFIG[i].waitDays} d</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div>
                                <label className="text-[7px] font-black text-slate-400 uppercase mb-0.5 block">Asunto Email</label>
                                <input value={temp.subject} onChange={(e) => handleTemplateChange(type as LeadType, i, 'subject', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-900 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-[7px] font-black text-slate-400 uppercase mb-0.5 block">Cuerpo del Mensaje</label>
                                <textarea rows={3} value={temp.body} onChange={(e) => handleTemplateChange(type as LeadType, i, 'body', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] text-slate-600 leading-relaxed font-medium focus:outline-none resize-none" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
               ))}
            </div>
          )}

          {view === 'settings' && (
            <div className="space-y-4 animate-in fade-in max-w-lg mx-auto">
              <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg"><User size={14} /></div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-900 italic">Identidad de Envío</h3>
                    <p className="text-[7px] font-bold text-slate-400 uppercase">Firma de cada contacto</p>
                  </div>
                </div>
                <div>
                    <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block px-0.5">Nombre comercial (Firma)</label>
                    <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Tu nombre" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-900 focus:outline-none" />
                </div>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center space-x-2 text-orange-500">
                  <Database size={14} />
                  <h3 className="text-xs font-black uppercase italic text-slate-900">Cloud Status</h3>
                </div>
                {!db ? (
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                    <p className="text-[8px] font-black text-amber-600 uppercase">Offline Mode</p>
                    <p className="text-[8px] text-slate-600 leading-relaxed font-bold">Datos persistentes solo en este navegador (Local Storage).</p>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-center space-x-3">
                    <Database size={12} className="text-orange-500" />
                    <div>
                      <p className="text-[10px] font-black text-slate-900 leading-none mb-0.5">Sincronizado con Firestore</p>
                      <p className="text-[7px] text-orange-600 font-black uppercase tracking-widest">Base de datos HakaLab Cloud Activa</p>
                    </div>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <button onClick={() => handleConnectGoogle()} className="w-full py-2 bg-slate-900 text-white rounded-lg font-black text-[8px] uppercase shadow hover:bg-slate-800 transition-all">
                    {googleToken ? 'Cuenta de Google Conectada ✓' : 'Vincular Google Workspace'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-10 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-2">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center p-1 rounded-lg transition-all ${view === 'dashboard' ? 'text-blue-500' : 'text-slate-600'}`}>
              <LayoutDashboard size={12} />
              <span className="text-[6px] font-black uppercase">Home</span>
            </button>
            <button onClick={() => setView('leads')} className={`flex flex-col items-center p-1 rounded-lg transition-all ${view === 'leads' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Users size={12} />
              <span className="text-[6px] font-black uppercase">Leads</span>
            </button>
            <button onClick={() => setView('templates')} className={`flex flex-col items-center p-1 rounded-lg transition-all ${view === 'templates' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Mail size={12} />
              <span className="text-[6px] font-black uppercase">Mails</span>
            </button>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center p-1 rounded-lg transition-all ${view === 'settings' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Settings size={12} />
              <span className="text-[6px] font-black uppercase">Set</span>
            </button>
          </footer>
        )}
      </main>

      {/* MODAL: NUEVO PROSPECTO */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-[280px] rounded-xl shadow-2xl p-6 space-y-5 animate-in zoom-in duration-200">
            <h3 className="text-lg font-black text-slate-900 italic uppercase leading-none">Alta de Lead</h3>
            <form onSubmit={async (e) => {
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
              await syncLeadToCloud(nl);
              await addActivityLog(nl, 'Prospecto creado');
              setIsAddingLead(false);
            }} className="space-y-2.5">
              <input required name="name" placeholder="Nombre completo" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-900 focus:outline-none" />
              <input required name="email" type="email" placeholder="Email corporativo" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-900 focus:outline-none" />
              <input required name="company" placeholder="Nombre Empresa" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-900 focus:outline-none" />
              <select name="type" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[9px] font-black text-slate-900 uppercase">
                <option value="KDM">Key Decision Maker</option>
                <option value="Referrer">Referidor / Alianza</option>
              </select>
              <button type="submit" className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-black text-[9px] uppercase shadow-md mt-4 active:scale-95 transition-all">Guardar Lead</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-400 font-black uppercase text-[7px] hover:text-slate-900 transition-colors">Volver</button>
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
