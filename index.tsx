
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
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

let db: Firestore | null = null;
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (err) {
  console.error("Firebase init failed:", err);
}

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
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
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
    
    const toSendToday = active.filter(l => {
      if (l.currentStep >= 4) return false;
      const originDate = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      if (!nextStepConfig) return false;
      
      const nextDueDate = new Date(originDate);
      nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      return nextDueDate <= new Date(); 
    });

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
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${view === id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}>
      <Icon size={18} />
      {!isSidecarMode && <span className="font-bold text-xs uppercase tracking-wider">{label}</span>}
    </button>
  );

  return (
    <div className={`flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans'] transition-all duration-500 ${isSidecarMode ? 'max-w-[420px] mx-auto border-x border-slate-800 shadow-2xl' : ''}`}>
      {!isSidecarMode && (
        <aside className="w-60 border-r border-slate-900 bg-slate-950/80 backdrop-blur-xl p-5 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-10 px-1">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/20"><LayoutDashboard size={20} className="text-white" /></div>
            <h1 className="text-sm font-black tracking-tighter text-white uppercase italic">Haka Tracker</h1>
          </div>
          <div className="space-y-1.5">
            <NavButton id="dashboard" icon={Calendar} label="Dashboard" />
            <NavButton id="leads" icon={Users} label="Prospectos" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-6 border-t border-slate-900 space-y-3">
             <button onClick={checkGmailResponses} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10 transition-all group ${isCheckingGmail ? 'opacity-50 pointer-events-none' : ''}`}>
                <RefreshCw size={16} className={isCheckingGmail ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                <span className="text-[10px] font-black uppercase tracking-widest">Sincronizar Gmail</span>
             </button>
             <div className="px-4 py-2 bg-slate-900 rounded-xl flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Conexión</span>
                {db ? <div className="flex items-center space-x-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div><Database size={14} className="text-emerald-400" /></div> : <CloudOff size={14} className="text-amber-500" />}
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all shadow-sm">
                <span className="text-[10px] font-bold uppercase">Sidebar</span>
                <Minimize2 size={14} />
             </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-950">
        <header className={`flex items-center justify-between px-8 border-b border-slate-900/50 bg-slate-950/80 backdrop-blur-md z-10 ${isSidecarMode ? 'h-14' : 'h-16'}`}>
          <div className="flex items-center space-x-3">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-2 bg-slate-900 rounded-xl text-slate-400 hover:text-white"><Maximize2 size={16} /></button>}
            <h2 className="font-black text-white text-lg tracking-tight uppercase italic">
              {view === 'dashboard' ? 'Resumen Operativo' : view === 'leads' ? 'Base de Leads' : view === 'templates' ? 'Secuencias de Mail' : 'Ajustes'}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-blue-900/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center space-x-2">
              <Plus size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Nuevo Lead</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Iniciando sistema...</p>
            </div>
          ) : view === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300 max-w-[1400px] mx-auto">
              
              <div className="lg:col-span-8 space-y-8">
                
                {/* 1. SE ENVIARÁN HOY */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-3 px-1">
                    <Clock size={18} className="text-blue-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Se enviarán hoy ({dashboardData.toSendToday.length})</h3>
                  </div>
                  {dashboardData.toSendToday.length === 0 ? (
                    <div className="bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-2xl p-10 text-center">
                      <p className="text-sm font-bold text-slate-600 uppercase tracking-widest italic">No hay correos programados para esta jornada.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {dashboardData.toSendToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-blue-500/50 hover:bg-slate-900/80 transition-all shadow-xl group">
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center space-x-4 overflow-hidden">
                              <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center font-black text-sm text-blue-500 border border-blue-500/10 group-hover:scale-110 transition-transform">{lead.name.charAt(0)}</div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-100 text-sm tracking-tight truncate mb-1">{lead.name}</h4>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="bg-blue-600/20 text-blue-400 text-[9px] font-black px-2.5 py-1 rounded-lg border border-blue-500/20 uppercase shadow-inner">Paso {lead.currentStep + 1}</div>
                          </div>
                          <div className="flex space-x-2">
                            <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-blue-600 h-11 rounded-xl flex items-center justify-center space-x-2 text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all active:scale-95">
                              {aiLoading === lead.id ? <Loader2 size={16} className="animate-spin" /> : <><Sparkles size={16} /><span>Redactar con IA</span></>}
                            </button>
                            <button onClick={() => openGmailRaw(lead)} className="w-11 h-11 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-500/50 transition-all active:scale-95"><Send size={18} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. ENVIADOS HOY */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-3 px-1">
                    <CheckCircle2 size={18} className="text-indigo-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Enviados hoy ({dashboardData.sentToday.length})</h3>
                  </div>
                  {dashboardData.sentToday.length === 0 ? (
                    <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 text-center">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Aún no has procesado envíos hoy.</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {dashboardData.sentToday.map(lead => (
                        <div key={lead.id} className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-xl flex items-center justify-between shadow-sm hover:bg-slate-900/50 transition-all">
                          <div className="flex items-center space-x-4 overflow-hidden">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center font-black text-xs text-indigo-400">{lead.name.charAt(0)}</div>
                            <div className="overflow-hidden">
                              <p className="text-sm font-black text-slate-300 truncate leading-none mb-1">{lead.name}</p>
                              <p className="text-[10px] text-slate-600 font-bold uppercase truncate">{lead.company} • Secuencia completada: Etapa {lead.currentStep}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 text-indigo-500 pr-2">
                             <Check size={14} className="stroke-[3]" />
                             <span className="text-[10px] font-black uppercase tracking-tighter">Confirmado</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="lg:col-span-4 space-y-8">
                
                {/* 3. HAN RESPONDIDO */}
                <section className="space-y-4">
                  <div className="flex items-center space-x-3 px-1">
                    <MessageSquare size={18} className="text-emerald-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Han respondido ({dashboardData.replied.length})</h3>
                  </div>
                  {dashboardData.replied.length === 0 ? (
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-10 text-center">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-widest italic">Esperando respuestas del mercado...</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {dashboardData.replied.map(lead => (
                        <div key={lead.id} className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 shadow-lg">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-4 overflow-hidden">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center font-black text-emerald-600 text-sm border border-emerald-500/10">{lead.name.charAt(0)}</div>
                              <div className="overflow-hidden">
                                <h4 className="font-black text-slate-900 text-sm tracking-tight truncate mb-1">{lead.name}</h4>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest truncate">{lead.company}</p>
                              </div>
                            </div>
                            <div className="p-2 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors" onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')}><ExternalLink size={16} className="text-slate-400" /></div>
                          </div>
                          <button onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95 shadow-lg shadow-emerald-900/20">Atender ahora</button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* MÉTRICAS */}
                <section className="p-6 bg-indigo-700 text-white rounded-2xl space-y-4 shadow-2xl shadow-indigo-900/40">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Tasa de Conversión</span>
                    <span className="text-3xl font-black italic">{dashboardData.total > 0 ? Math.round((dashboardData.replied.length / dashboardData.total) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white transition-all duration-1000" style={{ width: `${dashboardData.total > 0 ? (dashboardData.replied.length / dashboardData.total) * 100 : 0}%` }}></div>
                  </div>
                  <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Basado en {dashboardData.total} prospectos activos</p>
                </section>
              </div>
            </div>
          )}
          
          {view === 'leads' && (
             <div className="space-y-4 animate-in fade-in max-w-4xl mx-auto pb-10">
                <div className="relative mb-6">
                   <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nombre o empresa..." className="w-full bg-white border border-slate-200 rounded-2xl py-5 pl-14 pr-6 text-sm font-bold text-slate-900 focus:outline-none shadow-xl" />
                </div>
                <div className="grid gap-3">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between hover:border-blue-300 hover:shadow-lg transition-all shadow-sm group">
                      <div className="flex items-center space-x-5 overflow-hidden">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black transition-transform group-hover:scale-110 ${lead.type === 'KDM' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{lead.name.charAt(0)}</div>
                        <div className="overflow-hidden">
                          <p className="text-base font-black text-slate-900 leading-none mb-1.5 truncate">{lead.name}</p>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest truncate">{lead.company} • Secuencia: Etapa {lead.currentStep}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 shrink-0">
                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-wider ${lead.status === 'Active' ? 'text-blue-600 bg-blue-50 border-blue-100' : lead.status === 'Replied' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-slate-400 bg-slate-50 border-slate-100'}`}>{lead.status}</span>
                        <button onClick={() => deleteLeadFromCloud(lead.id)} className="text-slate-300 hover:text-red-500 p-2.5 bg-slate-50 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {view === 'templates' && (
            <div className="space-y-10 animate-in fade-in max-w-3xl mx-auto pb-20">
               <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex items-center justify-between shadow-2xl">
                  <div>
                    <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Editor de Estrategia</h3>
                    <p className="text-xs text-slate-500 font-black uppercase mt-1 tracking-widest">Personaliza el mensaje para cada etapa del embudo</p>
                  </div>
                  <button onClick={() => saveTemplates(templates)} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-black text-xs uppercase shadow-xl transition-all active:scale-95">
                    {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Guardar Cambios</span>
                  </button>
               </div>

               {['KDM', 'Referrer'].map(type => (
                 <div key={type} className="space-y-6">
                    <div className="flex items-center space-x-4 px-2">
                        <div className="w-10 h-0.5 bg-blue-600"></div>
                        <p className="text-xs font-black text-white uppercase tracking-[0.4em]">Flujo: {type === 'KDM' ? 'Decision Maker' : 'Referidores'}</p>
                    </div>
                    <div className="grid gap-6">
                      {templates[type as LeadType].map((temp, i) => (
                        <div key={i} className="bg-white border border-slate-200 p-8 rounded-3xl space-y-6 shadow-xl relative group">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                            <div className="flex items-center space-x-4">
                                <span className="bg-slate-900 px-3 py-1.5 rounded-xl text-[10px] font-black text-white uppercase tracking-widest">Etapa {temp.step}</span>
                                <h4 className="text-base font-black text-slate-900 uppercase italic tracking-tight">{temp.title}</h4>
                            </div>
                            <div className="flex items-center space-x-2 text-slate-400">
                                <Clock size={14} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Espera: {STEPS_CONFIG[i].waitDays} días</span>
                            </div>
                          </div>
                          <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1 tracking-widest">Asunto del Correo</label>
                                <input value={temp.subject} onChange={(e) => handleTemplateChange(type as LeadType, i, 'subject', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block px-1 tracking-widest">Cuerpo del Mensaje</label>
                                <textarea rows={6} value={temp.body} onChange={(e) => handleTemplateChange(type as LeadType, i, 'body', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-sm text-slate-600 leading-relaxed font-medium focus:outline-none resize-none" />
                                <p className="text-[10px] font-bold text-slate-400 mt-3 px-1 uppercase tracking-widest">Tokens: [ContactName] [Company] [MyName]</p>
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
              <div className="p-10 bg-white border border-slate-200 rounded-3xl space-y-8 shadow-xl">
                <div className="flex items-center space-x-5">
                  <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-900/20"><User size={24} /></div>
                  <div>
                    <h3 className="text-xl font-black uppercase text-slate-900 italic tracking-tighter">Identidad Comercial</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Firma automática del sistema</p>
                  </div>
                </div>
                <div>
                    <label className="text-xs font-black text-slate-400 uppercase mb-3 block px-1 tracking-widest">Nombre del Remitente</label>
                    <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Ej: Felipe Farias" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-base font-bold text-slate-900 focus:outline-none" />
                </div>
              </div>

              <div className="p-10 bg-white border border-slate-200 rounded-3xl space-y-8 shadow-xl">
                <div className="flex items-center space-x-4 text-orange-500">
                  <Database size={24} />
                  <h3 className="text-xl font-black uppercase italic text-slate-900 tracking-tighter">Estado de la Nube</h3>
                </div>
                {!db ? (
                  <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl space-y-3">
                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest">Sistema Offline</p>
                    <p className="text-sm text-slate-600 leading-relaxed font-bold italic">Los datos se guardan localmente. Configura Firebase para habilitar sincronización multi-dispositivo.</p>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center space-x-5">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-lg border border-emerald-100"><Database size={24} /></div>
                    <div>
                      <p className="text-base font-black text-slate-900 leading-none mb-1.5">Firestore Sincronizado</p>
                      <p className="text-xs text-emerald-600 font-black uppercase tracking-widest">HakaLab Cloud Active ✓</p>
                    </div>
                  </div>
                )}
                <div className="pt-8 border-t border-slate-100 space-y-4">
                  <div className="flex items-center space-x-3 text-slate-900">
                    <Mail size={20} />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em]">Google Workspace</h3>
                  </div>
                  <button onClick={() => handleConnectGoogle()} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase shadow-2xl hover:bg-slate-800 transition-all active:scale-95 tracking-widest">
                    {googleToken ? 'Cuenta Conectada Correctamente ✓' : 'Vincular Google Workspace'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-14 border-t border-slate-900 bg-slate-950 flex items-center justify-around px-4">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'dashboard' ? 'text-blue-500 bg-blue-500/5 shadow-inner' : 'text-slate-600'}`}>
              <LayoutDashboard size={18} />
              <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Home</span>
            </button>
            <button onClick={() => setView('leads')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'leads' ? 'text-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>
              <Users size={18} />
              <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Leads</span>
            </button>
            <button onClick={() => setView('templates')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'templates' ? 'text-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>
              <Mail size={18} />
              <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Mail</span>
            </button>
            <button onClick={() => setView('settings')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'settings' ? 'text-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>
              <Settings size={18} />
              <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Config</span>
            </button>
          </footer>
        )}
      </main>

      {/* MODAL: ALTA DE LEAD */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center z-50 p-6">
          <div className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl p-10 space-y-8 animate-in zoom-in duration-300">
            <h3 className="text-2xl font-black text-slate-900 italic uppercase leading-none tracking-tighter">Alta de Prospecto</h3>
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
            }} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Nombre Completo</label>
                <input required name="name" placeholder="Ej: John Doe" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Correo Electrónico</label>
                <input required name="email" type="email" placeholder="ejemplo@empresa.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Compañía / Empresa</label>
                <input required name="company" placeholder="Nombre de la empresa" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Tipo de Contacto</label>
                <select name="type" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-xs font-black text-slate-900 uppercase tracking-widest">
                  <option value="KDM">Key Decision Maker (KDM)</option>
                  <option value="Referrer">Referidor / Alianza</option>
                </select>
              </div>
              <button type="submit" className="w-full py-4.5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl shadow-blue-900/20 mt-6 active:scale-95 transition-all">Guardar en Base de Datos</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-colors">Volver al Dashboard</button>
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
