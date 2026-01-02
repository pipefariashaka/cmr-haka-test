
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { initializeApp } from "firebase/app";
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
} from "firebase/firestore";
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
  CheckCircle
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
      if (savedTemplates) {
        setTemplates(JSON.parse(savedTemplates));
      }

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
    const todayStr = now.toISOString().split('T')[0];
    
    const active = leads.filter(l => l.status === 'Active');
    const repliedLeads = leads.filter(l => l.status === 'Replied');
    
    // Se enviarán hoy: Leads activos que han cumplido su periodo de espera
    const toSendToday = active.filter(l => {
      if (l.currentStep >= 4) return false;
      const lastDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      if (!nextStepConfig) return false;
      
      const nextDueDate = new Date(lastDate);
      nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      return nextDueDate <= now;
    });

    // Enviados hoy: Basado en los logs de hoy
    const sentTodayIds = new Set(
      logs
        .filter(log => log.timestamp.startsWith(todayStr) && log.action.includes('Email enviado'))
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
      
      if (!foundAny) {
        alert("No se detectaron nuevas respuestas de tus leads activos.");
      } else {
        alert("¡Respuestas detectadas! Algunos leads han sido marcados como 'Respondido'.");
      }
    } catch (err) {
      console.error("Error al consultar Gmail:", err);
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
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all ${view === id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <Icon size={16} />
      {!isSidecarMode && <span className="font-semibold text-xs">{label}</span>}
    </button>
  );

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[400px] mx-auto border-x border-slate-800 shadow-xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-56 border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl p-5 flex flex-col z-20">
          <div className="flex items-center space-x-2.5 mb-10">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-blue-900/40"><LayoutDashboard size={16} className="text-white" /></div>
            <h1 className="text-sm font-black tracking-tighter text-white uppercase">Haka Tracker</h1>
          </div>
          <div className="space-y-1.5">
            <NavButton id="dashboard" icon={Calendar} label="Dashboard" />
            <NavButton id="leads" icon={Users} label="Base de Leads" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-5 border-t border-slate-900 space-y-3">
             <button onClick={checkGmailResponses} className={`w-full flex items-center space-x-2.5 px-3 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 transition-all group ${isCheckingGmail ? 'opacity-50 pointer-events-none' : ''}`}>
                <RefreshCw size={14} className={isCheckingGmail ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                <span className="text-[9px] font-black uppercase tracking-widest">Check Gmail</span>
             </button>
             <div className="px-3 py-1.5 bg-slate-900 rounded-lg flex items-center justify-between">
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">State</span>
                {db ? (
                  isSyncing ? <CloudUpload size={12} className="text-orange-500 animate-pulse" /> : <Database size={12} className="text-orange-400" />
                ) : (
                  <div className="flex items-center space-x-1">
                    <CloudOff size={12} className="text-amber-500" />
                    <span className="text-[7px] text-amber-500 font-bold uppercase">Local</span>
                  </div>
                )}
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all">
                <span className="text-[10px] font-bold uppercase">Sidebar</span>
                <Minimize2 size={12} />
             </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-6 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-14' : 'h-16'}`}>
          <div className="flex items-center space-x-2.5">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-1.5 bg-slate-900 rounded-lg text-slate-400"><Maximize2 size={12} /></button>}
            <h2 className="font-black text-white text-lg tracking-tight uppercase italic">
              {view === 'dashboard' ? 'Overview' : view === 'leads' ? 'Mis Leads' : view === 'templates' ? 'Emails' : 'Settings'}
            </h2>
          </div>
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg items-center space-x-2.5">
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-500 uppercase leading-none">Total</p>
                <p className="text-xs font-black text-white">{dashboardData.total}</p>
              </div>
              <TrendingUp size={12} className="text-blue-500" />
            </div>
            <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-500 transition-all active:scale-95 flex items-center space-x-1.5">
              <Plus size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Nuevo</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-3">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cargando...</p>
            </div>
          ) : view === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
              
              <div className="lg:col-span-2 space-y-8">
                
                {/* 1. SE ENVIARÁN HOY */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-2 px-1">
                    <Clock size={14} className="text-blue-400" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Se enviarán hoy ({dashboardData.toSendToday.length})</h3>
                  </div>
                  {dashboardData.toSendToday.length === 0 ? (
                    <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-8 text-center">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">No hay envíos programados para hoy</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {dashboardData.toSendToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl group transition-all duration-300 flex flex-col justify-between hover:border-blue-500/50 shadow-sm">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3 overflow-hidden">
                              <div className="w-9 h-9 rounded-xl bg-blue-600/10 flex items-center justify-center font-black text-xs text-blue-500 border border-blue-500/10">{lead.name.charAt(0)}</div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-100 text-sm tracking-tight truncate">{lead.name}</h4>
                                <p className="text-[8px] text-slate-500 font-black uppercase truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="bg-blue-600/20 text-blue-400 text-[8px] font-black px-2 py-1 rounded-lg border border-blue-500/20 uppercase">Paso {lead.currentStep + 1}</div>
                          </div>
                          <div className="flex space-x-2">
                            <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-blue-600 h-9 rounded-xl flex items-center justify-center space-x-1.5 text-white font-black text-[9px] uppercase tracking-widest hover:bg-blue-500 disabled:opacity-50 transition-all">
                              {aiLoading === lead.id ? <Loader2 size={12} className="animate-spin" /> : <><Sparkles size={12} /><span>Redactar IA</span></>}
                            </button>
                            <button onClick={() => openGmailRaw(lead)} className="w-9 h-9 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all active:scale-95"><Send size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. ENVIADOS HOY */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-2 px-1">
                    <CheckCircle size={14} className="text-indigo-400" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Enviados hoy ({dashboardData.sentToday.length})</h3>
                  </div>
                  {dashboardData.sentToday.length === 0 ? (
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center">
                      <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Aún no has enviado correos hoy</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {dashboardData.sentToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/30 border border-slate-800/50 p-3 rounded-xl flex items-center justify-between shadow-sm">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center font-black text-[10px] text-indigo-400">{lead.name.charAt(0)}</div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-black text-slate-300 truncate leading-none mb-1">{lead.name}</p>
                              <p className="text-[8px] text-slate-500 font-bold uppercase truncate">{lead.company} • Paso {lead.currentStep} completado</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 text-indigo-500">
                             <Check size={12} />
                             <span className="text-[8px] font-black uppercase">Enviado</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 3. HAN RESPONDIDO */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-2 px-1">
                    <MessageSquare size={14} className="text-green-400" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Han respondido ({dashboardData.replied.length})</h3>
                  </div>
                  {dashboardData.replied.length === 0 ? (
                    <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center">
                      <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">Sin respuestas pendientes en el sistema</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {dashboardData.replied.map(lead => (
                        <div key={lead.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col justify-between hover:shadow-lg transition-all duration-300 shadow-md">
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center font-black text-green-600 text-sm border border-green-500/10">{lead.name.charAt(0)}</div>
                            <div className="flex-1 overflow-hidden">
                              <h4 className="font-black text-slate-900 text-sm truncate tracking-tight">{lead.name}</h4>
                              <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{lead.company}</p>
                            </div>
                            <div className="p-1.5 bg-slate-50 rounded-full cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')}><ExternalLink size={12} className="text-slate-400" /></div>
                          </div>
                          <button onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')} className="w-full py-2.5 bg-green-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-green-500 transition-all shadow active:scale-95">Continuar conversación</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Sidebar Activity & Metrics */}
              <div className="space-y-6">
                <section className="space-y-4">
                  <div className="flex items-center space-x-2 px-1">
                    <History size={14} className="text-slate-500" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Actividad Reciente</h3>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-5 min-h-[400px] shadow-lg max-h-[600px] overflow-y-auto custom-scrollbar">
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center py-20">
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Sin logs aún</p>
                      </div>
                    ) : (
                      <div className="space-y-5 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-100">
                        {logs.map(log => (
                          <div key={log.id} className="relative pl-7 space-y-1">
                            <div className="absolute left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-600 border-2 border-white shadow-sm"></div>
                            <p className="text-[10px] font-black text-slate-900 uppercase leading-none truncate">{log.leadName}</p>
                            <div className="flex items-center justify-between">
                                <p className="text-[8px] font-bold text-slate-500">{log.action}</p>
                                <p className="text-[7px] font-black text-slate-400 uppercase">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="p-5 bg-blue-600 text-white rounded-3xl space-y-3 shadow-lg shadow-blue-900/20">
                  <h4 className="text-[9px] font-black uppercase tracking-widest opacity-70">Tasa de Respuesta</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-[8px] font-bold uppercase opacity-80">Conversión</span>
                      <span className="text-2xl font-black italic">{dashboardData.total > 0 ? Math.round((dashboardData.replied.length / dashboardData.total) * 100) : 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-blue-900/30 rounded-full overflow-hidden">
                      <div className="h-full bg-white" style={{ width: `${dashboardData.total > 0 ? (dashboardData.replied.length / dashboardData.total) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-4 animate-in fade-in max-w-4xl mx-auto">
                <div className="relative mb-6">
                   <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar en la base de datos..." className="w-full bg-white border border-slate-200 rounded-xl py-4 pl-12 pr-6 text-sm font-bold text-slate-900 focus:outline-none shadow-md" />
                </div>
                <div className="grid gap-2">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between hover:border-blue-200 transition-all shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${lead.type === 'KDM' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{lead.name.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-black text-slate-900 leading-none mb-1">{lead.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{lead.company} • Paso: {lead.currentStep}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`text-[7px] font-black px-2 py-1 rounded-lg border uppercase ${lead.status === 'Active' ? 'text-blue-600 bg-blue-50 border-blue-100' : lead.status === 'Replied' ? 'text-green-600 bg-green-50 border-green-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>{lead.status}</span>
                        <button onClick={() => deleteLeadFromCloud(lead.id)} className="text-slate-300 hover:text-red-500 p-2 bg-slate-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'templates' && (
            <div className="space-y-10 animate-in fade-in max-w-4xl mx-auto pb-10">
               <div className="bg-blue-600/5 p-6 rounded-3xl border border-blue-500/10 mb-8 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-white italic uppercase">Editor de Secuencias</h3>
                    <p className="text-[9px] text-slate-500 font-black uppercase mt-0.5">Define los mensajes para cada etapa</p>
                  </div>
                  <button onClick={() => saveTemplates(templates)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase shadow-md transition-all active:scale-95">
                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Guardar Todo</span>
                  </button>
               </div>

               {['KDM', 'Referrer'].map(type => (
                 <div key={type} className="space-y-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-0.5 bg-blue-600"></div>
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Secuencia {type}</p>
                    </div>
                    <div className="grid gap-6">
                      {templates[type as LeadType].map((temp, i) => (
                        <div key={i} className="bg-white border border-slate-200 p-8 rounded-3xl space-y-5 shadow-lg relative group">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div className="flex items-center space-x-2.5">
                                <span className="bg-slate-900 px-3 py-1.5 rounded-lg text-[9px] font-black text-white uppercase">Paso {temp.step}</span>
                                <h4 className="text-base font-black text-slate-900">{temp.title}</h4>
                            </div>
                            <div className="flex items-center space-x-1.5 text-slate-400">
                                <Clock size={12} />
                                <span className="text-[9px] font-black uppercase">Espera: {STEPS_CONFIG[i].waitDays} d</span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block px-0.5">Asunto</label>
                                <input 
                                    value={temp.subject} 
                                    onChange={(e) => handleTemplateChange(type as LeadType, i, 'subject', e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase mb-1.5 block px-0.5">Cuerpo</label>
                                <textarea 
                                    rows={6}
                                    value={temp.body} 
                                    onChange={(e) => handleTemplateChange(type as LeadType, i, 'body', e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs text-slate-600 leading-relaxed font-medium focus:outline-none transition-all resize-none"
                                />
                                <p className="text-[8px] text-slate-400 font-bold mt-1.5 px-0.5 uppercase">Atajos: [ContactName] [Company] [MyName]</p>
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
            <div className="space-y-8 animate-in fade-in max-w-2xl mx-auto">
              <div className="p-8 bg-white border border-slate-200 rounded-3xl space-y-8 shadow-lg">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md"><User size={20} /></div>
                  <div>
                    <h3 className="text-xl font-black uppercase text-slate-900 italic">Identidad</h3>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Configuración de firma</p>
                  </div>
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1">Tu Nombre Comercial</label>
                    <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej: Felipe Farias" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 text-sm font-bold text-slate-900 focus:outline-none transition-all" />
                </div>
              </div>

              <div className="p-8 bg-white border border-slate-200 rounded-3xl space-y-6 shadow-lg">
                <div className="flex items-center space-x-3 text-orange-500">
                  <Database size={24} />
                  <h3 className="text-lg font-black uppercase italic text-slate-900">Infraestructura</h3>
                </div>
                {!db ? (
                  <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl space-y-3">
                    <p className="text-[10px] font-black text-amber-600 uppercase">Modo Local</p>
                    <p className="text-[10px] text-slate-600 leading-relaxed font-bold">
                      Configura `FIREBASE_API_KEY` para sincronizar.
                    </p>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-100 p-5 rounded-2xl flex items-center space-x-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-500 shadow-sm border border-orange-100"><Database size={20} /></div>
                    <div>
                      <p className="text-sm font-black text-slate-900 leading-none">Firestore Activo</p>
                      <p className="text-[8px] text-orange-600 font-black uppercase">Nube Sincronizada</p>
                    </div>
                  </div>
                )}
                
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center space-x-3 text-slate-900">
                    <Mail size={18} />
                    <h3 className="text-[10px] font-black uppercase">Google Workspace</h3>
                  </div>
                  <button onClick={() => handleConnectGoogle()} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase shadow hover:bg-slate-800 transition-all active:scale-95">
                    {googleToken ? 'Cuenta Vinculada ✓' : 'Vincular Workspace'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-16 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-3">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${view === 'dashboard' ? 'text-blue-500' : 'text-slate-600'}`}>
              <LayoutDashboard size={18} />
              <span className="text-[7px] font-black uppercase">Home</span>
            </button>
            <button onClick={() => setView('leads')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${view === 'leads' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Users size={18} />
              <span className="text-[7px] font-black uppercase">Leads</span>
            </button>
            <button onClick={() => setView('templates')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${view === 'templates' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Mail size={18} />
              <span className="text-[7px] font-black uppercase">Mails</span>
            </button>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center p-2 rounded-lg transition-all ${view === 'settings' ? 'text-blue-500' : 'text-slate-600'}`}>
              <Settings size={18} />
              <span className="text-[7px] font-black uppercase">Ajustes</span>
            </button>
          </footer>
        )}
      </main>

      {/* Modals */}
      {isSyncingContacts && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-xl rounded-3xl shadow-2xl flex flex-col h-[75vh] overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-slate-900 italic uppercase">Importar</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select from Gmail</p>
              </div>
              <div className="relative w-48">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2 pl-10 pr-4 text-xs font-bold text-slate-900 focus:outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-2 bg-slate-50/30 custom-scrollbar">
              {isFetchingRealContacts ? (
                <div className="h-full flex items-center justify-center flex-col space-y-3">
                  <Loader2 size={24} className="text-blue-500 animate-spin" />
                  <p className="text-[8px] text-slate-400 font-black uppercase">Loading Contacts...</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {realContacts.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                    <div key={c.id} onClick={() => {
                      const s = new Set(selectedContacts);
                      if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                      setSelectedContacts(s);
                    }} className={`p-4 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${selectedContacts.has(c.id) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 hover:border-blue-400'}`}>
                      <div className="flex items-center space-x-3">
                        <img src={c.photoUrl} className="w-9 h-9 rounded-lg shadow-sm" onError={(e) => (e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.name))} />
                        <div className="overflow-hidden">
                          <p className="text-sm font-black leading-none mb-1 truncate">{c.name}</p>
                          <p className="text-[9px] font-bold uppercase opacity-70 truncate">{c.email}</p>
                        </div>
                      </div>
                      {selectedContacts.has(c.id) && <Check size={16} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedContacts.size > 0 && (
              <div className="p-6 border-t border-slate-100 bg-white flex space-x-3">
                <button onClick={async () => {
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
                   for (const l of toAdd) {
                     await syncLeadToCloud(l);
                     await addActivityLog(l, 'Importado de contactos');
                   }
                   setIsSyncingContacts(false);
                   setSelectedContacts(new Set());
                }} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-md active:scale-95 transition-all">Import KDM ({selectedContacts.size})</button>
              </div>
            )}
            <button onClick={() => setIsSyncingContacts(false)} className="py-4 text-slate-400 text-[9px] font-black uppercase hover:text-slate-900 transition-colors">Cerrar</button>
          </div>
        </div>
      )}

      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-[340px] rounded-3xl shadow-2xl p-10 space-y-8 animate-in zoom-in duration-200">
            <h3 className="text-2xl font-black text-slate-900 italic uppercase">Nuevo Lead</h3>
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
              await addActivityLog(nl, 'Creado manualmente');
              setIsAddingLead(false);
            }} className="space-y-4">
              <input required name="name" placeholder="Nombre" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none" />
              <input required name="email" type="email" placeholder="Email" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none" />
              <input required name="company" placeholder="Empresa" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none" />
              <select name="type" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-black text-slate-900 uppercase">
                <option value="KDM">Decision Maker (KDM)</option>
                <option value="Referrer">Referidor</option>
              </select>
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-md mt-4 active:scale-95 transition-all">Crear Lead</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-400 font-black uppercase text-[9px] hover:text-slate-900 transition-colors">Volver</button>
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
