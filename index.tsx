
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
  ArrowRight,
  Hourglass,
  ChevronDown,
  ChevronUp
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
  const [isSidecarMode, setIsSidecarMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  
  // Estado para el acordeón de secuencias: un objeto { [leadType-stepIndex]: boolean }
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({ 'KDM-0': true, 'Referrer-0': true });

  const toggleStep = (type: LeadType, index: number) => {
    const key = `${type}-${index}`;
    setOpenSteps(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

        const configSnap = await getDoc(doc(db, "config", "templates"));
        if (configSnap.exists()) {
          const cloudTemplates = JSON.parse(configSnap.data().value);
          setTemplates(cloudTemplates);
          localStorage.setItem('hakalab_templates_v1', configSnap.data().value);
        }
      } else {
        const savedLeads = localStorage.getItem('hakalab_leads_v6');
        if (savedLeads) setLeads(JSON.parse(savedLeads));
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
    const activeLeads = leads.filter(l => l.status === 'Active');
    const repliedLeads = leads.filter(l => l.status === 'Replied');
    
    const newProspects = activeLeads.filter(l => l.currentStep === 0);

    const toSendToday = activeLeads.filter(l => {
      if (l.currentStep === 0 || l.currentStep >= 4) return false;
      const lastAction = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      if (!nextStepConfig) return false;
      
      const nextDueDate = new Date(lastAction);
      nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      return nextDueDate <= new Date(); 
    });

    const inProgress = activeLeads.filter(l => {
      if (l.currentStep === 0 || l.currentStep >= 4) return false;
      
      const lastAction = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      if (!nextStepConfig) return false;

      const nextDueDate = new Date(lastAction);
      nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      return nextDueDate > new Date();
    }).map(l => {
      const lastAction = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG.find(s => s.step === l.currentStep + 1);
      const nextDueDate = new Date(lastAction);
      if (nextStepConfig) nextDueDate.setDate(nextDueDate.getDate() + nextStepConfig.waitDays);
      
      const diffTime = nextDueDate.getTime() - new Date().getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return { ...l, nextDueDate, diffDays };
    });

    return {
      total: leads.length,
      newProspects,
      toSendToday,
      inProgress,
      replied: repliedLeads
    };
  }, [leads]);

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
    <div className={`flex h-screen bg-black text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans']`}>
      {/* Sidebar */}
      {!isSidecarMode && (
        <aside className="w-64 border-r border-slate-900 bg-[#020617] p-6 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-12 px-2">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/20">
              <LayoutDashboard size={20} className="text-white" />
            </div>
            <h1 className="text-sm font-black tracking-tighter text-white uppercase italic">Haka Tracker</h1>
          </div>
          <div className="space-y-2">
            <NavButton id="dashboard" icon={Calendar} label="Dashboard" />
            <NavButton id="leads" icon={Users} label="Prospectos" />
            <NavButton id="templates" icon={Mail} label="Secuencias" />
            <NavButton id="settings" icon={Settings} label="Ajustes" />
          </div>
          <div className="mt-auto pt-6 border-t border-slate-900/50 space-y-4">
             <div className="px-4 py-3 bg-slate-900/30 rounded-2xl flex items-center justify-between border border-slate-800/50">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado DB</span>
                <div className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <Database size={14} className="text-emerald-400" />
                </div>
             </div>
             <button onClick={() => setIsSidecarMode(true)} className="w-full flex items-center justify-between px-5 py-3 rounded-2xl bg-slate-900/40 border border-slate-800/50 text-slate-400 hover:text-white transition-all shadow-sm group">
                <span className="text-[10px] font-bold uppercase group-hover:tracking-widest transition-all">Minimizar</span>
                <Minimize2 size={14} />
             </button>
          </div>
        </aside>
      )}

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-black">
        <header className="flex items-center justify-between px-10 h-24 border-b border-slate-900/30 bg-black z-10">
          <div className="flex items-center">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-3 bg-slate-900/50 rounded-2xl text-slate-400 hover:text-white mr-6 border border-slate-800/50"><Maximize2 size={16} /></button>}
            <h2 className="font-black text-white text-3xl tracking-tighter uppercase italic">{view === 'templates' ? 'Secuencias' : view.charAt(0).toUpperCase() + view.slice(1)}</h2>
          </div>
          <div className="flex items-center space-x-8">
            <div className="flex flex-col items-end">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Prospectos</span>
               <div className="flex items-center space-x-2.5">
                 <span className="text-3xl font-black text-white italic tracking-tighter">{leads.length}</span>
                 <TrendingUp size={18} className="text-blue-500" />
               </div>
            </div>
            <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl shadow-2xl shadow-blue-900/40 hover:bg-blue-500 transition-all active:scale-95 flex items-center space-x-3">
              <Plus size={20} className="stroke-[3]" />
              <span className="text-xs font-black uppercase tracking-widest">Nuevo Lead</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-6">
              <Loader2 size={40} className="text-blue-500 animate-spin" />
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Sincronizando registros...</p>
            </div>
          ) : view === 'dashboard' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 max-w-[1500px] mx-auto animate-in fade-in duration-700">
              {/* Dashboard Content remains the same as previously optimized */}
              <div className="lg:col-span-8 space-y-12">
                <section className="space-y-6 max-w-3xl">
                  <div className="flex items-center space-x-3 px-3">
                    <Sparkles size={18} className="text-blue-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] opacity-80">Nuevos Prospectos ({dashboardData.newProspects.length})</h3>
                  </div>
                  <div className="bg-[#0f172a]/80 border border-slate-700/50 rounded-[40px] p-6 backdrop-blur-xl shadow-2xl">
                    {dashboardData.newProspects.length === 0 ? (
                      <div className="p-12 text-center opacity-40">
                        <p className="text-sm font-black text-slate-500 uppercase tracking-widest italic">Base de datos al día.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {dashboardData.newProspects.map(lead => (
                          <div key={lead.id} className="bg-[#1e293b]/50 border border-slate-700/40 p-6 rounded-[28px] flex items-center justify-between hover:bg-[#1e293b] hover:border-blue-500/30 transition-all group">
                            <div className="flex items-center space-x-6">
                              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 flex items-center justify-center font-black text-xl text-blue-500 border border-blue-500/10 group-hover:scale-105 transition-transform">{lead.name.charAt(0)}</div>
                              <div>
                                <h4 className="font-black text-white text-lg tracking-tight truncate leading-none mb-2">{lead.name}</h4>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{lead.company} • {lead.type}</p>
                              </div>
                            </div>
                            <button onClick={() => openGmailRaw(lead)} className="bg-blue-600 text-white px-7 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center space-x-3 hover:bg-blue-500 shadow-xl shadow-blue-900/20 active:scale-95 transition-all">
                               <Send size={16} />
                               <span>Mandar Paso 1</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-6 max-w-3xl">
                  <div className="flex items-center space-x-3 px-3">
                    <Clock size={18} className="text-amber-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] opacity-80">Seguimientos Hoy ({dashboardData.toSendToday.length})</h3>
                  </div>
                  <div className="bg-[#0f172a]/80 border border-slate-700/50 rounded-[40px] p-6 backdrop-blur-xl shadow-2xl">
                    {dashboardData.toSendToday.length === 0 ? (
                      <div className="p-16 flex flex-col items-center justify-center space-y-5 opacity-40">
                        <div className="p-4 bg-slate-900/50 rounded-full text-slate-600 border border-slate-800/50"><Check size={28} /></div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sin tareas pendientes</p>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {dashboardData.toSendToday.map(lead => (
                          <div key={lead.id} className="bg-[#1e293b]/50 border border-slate-700/40 p-6 rounded-[32px] flex flex-col justify-between hover:border-amber-500/30 transition-all group">
                            <div className="flex items-center justify-between mb-8">
                              <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-600/10 flex items-center justify-center font-black text-lg text-amber-500 border border-amber-500/10">{lead.name.charAt(0)}</div>
                                <div className="overflow-hidden">
                                  <h4 className="font-black text-slate-100 text-sm tracking-tight truncate mb-1">{lead.name}</h4>
                                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest truncate">{lead.company}</p>
                                </div>
                              </div>
                              <div className="bg-amber-600/20 text-amber-400 text-[9px] font-black px-3 py-1.5 rounded-xl border border-amber-500/10 uppercase italic">Etapa {lead.currentStep + 1}</div>
                            </div>
                            <div className="flex space-x-2">
                              <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="flex-1 bg-amber-600 h-14 rounded-2xl flex items-center justify-center space-x-2 text-white font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 shadow-lg shadow-amber-900/10 transition-all active:scale-95">
                                {aiLoading === lead.id ? <Loader2 size={16} className="animate-spin" /> : <><Sparkles size={16} /><span>Borrador IA</span></>}
                              </button>
                              <button onClick={() => openGmailRaw(lead)} className="w-14 h-14 bg-slate-800/50 border border-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-amber-500 transition-all"><Send size={20} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
              <div className="lg:col-span-4 space-y-12">
                <section className="space-y-6">
                  <div className="flex items-center space-x-3 px-2">
                    <MessageSquare size={18} className="text-emerald-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] opacity-80">Respuestas ({dashboardData.replied.length})</h3>
                  </div>
                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-[40px] p-6 shadow-2xl">
                    {dashboardData.replied.length === 0 ? (
                      <div className="p-12 text-center opacity-30">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Inbox vacío.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {dashboardData.replied.map(lead => (
                          <div key={lead.id} className="bg-white p-6 rounded-[32px] flex flex-col justify-between hover:shadow-2xl transition-all duration-300 shadow-xl border border-white">
                            <div className="flex items-center justify-between mb-5">
                              <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center font-black text-emerald-600 text-lg">{lead.name.charAt(0)}</div>
                                <div>
                                  <h4 className="font-black text-slate-900 text-base tracking-tighter leading-none mb-1.5">{lead.name}</h4>
                                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest truncate">{lead.company}</p>
                                </div>
                              </div>
                              <ExternalLink size={18} className="text-slate-300" />
                            </div>
                            <button onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')} className="w-full py-4.5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95 shadow-xl shadow-emerald-900/20">Atender ahora</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <section className="space-y-6">
                  <div className="flex items-center space-x-3 px-2">
                    <Hourglass size={18} className="text-indigo-400" />
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.4em] opacity-80">En Secuencia Activa ({dashboardData.inProgress.length})</h3>
                  </div>
                  <div className="bg-[#111827] border border-slate-700/50 rounded-[40px] p-6 shadow-2xl">
                    {dashboardData.inProgress.length === 0 ? (
                      <div className="p-10 text-center opacity-20">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sin procesos activos.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {dashboardData.inProgress.map(lead => (
                          <div key={lead.id} className="bg-slate-900 border border-slate-700/60 p-6 rounded-[32px] space-y-6 shadow-xl group">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-black text-xs text-slate-200 border border-slate-700">{lead.name.charAt(0)}</div>
                                <div>
                                  <h4 className="font-black text-white text-sm tracking-tighter leading-none mb-1.5">{lead.name}</h4>
                                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{lead.company}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                 <span className="text-[10px] font-black text-blue-400 italic">en {lead.diffDays}d</span>
                              </div>
                            </div>
                            <div className="bg-black/40 rounded-2xl p-4 border border-slate-800/40">
                               <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                                 <span>Progreso</span>
                                 <span className="text-white">Paso {lead.currentStep} de 4</span>
                               </div>
                               <div className="flex items-center space-x-1.5">
                                  {[1,2,3,4].map(s => (
                                     <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= lead.currentStep ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]' : 'bg-slate-800'}`}></div>
                                  ))}
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : view === 'leads' ? (
             <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in">
                <div className="relative mb-6">
                   <Search size={28} className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-500" />
                   <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar base de datos central..." className="w-full bg-[#0f172a] border border-slate-800 rounded-[40px] py-9 pl-24 pr-12 text-xl font-black text-white focus:outline-none shadow-2xl focus:ring-4 focus:ring-blue-500/5 transition-all" />
                </div>
                <div className="grid gap-4">
                  {leads.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.company.toLowerCase().includes(searchQuery.toLowerCase())).map(lead => (
                    <div key={lead.id} className="p-8 bg-[#0f172a]/80 border border-slate-700/50 rounded-[40px] flex items-center justify-between hover:border-slate-500 shadow-xl group transition-all">
                      <div className="flex items-center space-x-10">
                        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-2xl font-black ${lead.type === 'KDM' ? 'bg-blue-600/10 text-blue-500' : 'bg-amber-600/10 text-amber-500'} border border-white/5`}>{lead.name.charAt(0)}</div>
                        <div>
                          <p className="text-3xl font-black text-white leading-none mb-3 italic tracking-tighter">{lead.name}</p>
                          <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">{lead.company} • Secuencia: {lead.currentStep} / 4</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-8">
                        <span className={`text-[11px] font-black px-6 py-3 rounded-2xl border uppercase tracking-[0.2em] ${lead.status === 'Active' ? 'text-blue-500 border-blue-500/20 bg-blue-500/5' : lead.status === 'Replied' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' : 'text-slate-500 border-slate-500/20 bg-slate-500/5'}`}>{lead.status}</span>
                        <button onClick={() => deleteLeadFromCloud(lead.id)} className="text-slate-700 hover:text-red-500 p-5 bg-black rounded-2xl transition-all border border-slate-800 hover:border-red-500/50"><Trash2 size={24} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </div>
          ) : view === 'templates' ? (
             <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in pb-20">
                {/* Header compactado */}
                <div className="bg-[#0f172a]/90 border border-slate-700/60 p-8 rounded-[40px] flex items-center justify-between shadow-2xl backdrop-blur-md">
                  <div>
                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Copy Engine</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase mt-1 tracking-widest opacity-70">Gestiona tus guiones de ventas</p>
                  </div>
                  <button onClick={() => saveTemplates(templates)} className="flex items-center space-x-3 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-[20px] font-black text-[10px] uppercase shadow-2xl transition-all active:scale-95">
                    {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>Guardar Cambios</span>
                  </button>
                </div>

                {/* Secciones de secuencias */}
                {['KDM', 'Referrer'].map(type => (
                  <div key={type} className="space-y-4">
                    <div className="flex items-center space-x-4 px-6 py-2">
                      <div className="w-8 h-0.5 bg-blue-600 rounded-full"></div>
                      <p className="text-[11px] font-black text-white uppercase tracking-[0.4em] italic opacity-80">{type === 'KDM' ? 'Decision Makers (KDM)' : 'Red de Referidos'}</p>
                    </div>
                    
                    <div className="space-y-3">
                      {templates[type as LeadType].map((temp, i) => {
                        const isOpen = openSteps[`${type}-${i}`];
                        return (
                          <div key={i} className={`bg-[#0f172a]/80 border border-slate-700/50 rounded-[32px] overflow-hidden shadow-xl transition-all duration-300 ${isOpen ? 'ring-1 ring-blue-500/20' : 'hover:border-slate-500'}`}>
                            {/* Accordion Trigger */}
                            <button 
                              onClick={() => toggleStep(type as LeadType, i)}
                              className="w-full p-6 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
                            >
                              <div className="flex items-center space-x-6">
                                <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-colors ${isOpen ? 'bg-blue-600 border-blue-600 text-white' : 'bg-black border-slate-800 text-slate-400'}`}>Paso {temp.step}</span>
                                <h4 className="text-lg font-black text-white uppercase italic tracking-tight">{temp.title}</h4>
                              </div>
                              <div className="flex items-center space-x-6">
                                 <div className="flex items-center space-x-2 text-slate-500">
                                    <Clock size={14} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Espera: {STEPS_CONFIG[i].waitDays}d</span>
                                 </div>
                                 {isOpen ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                              </div>
                            </button>

                            {/* Accordion Content */}
                            {isOpen && (
                              <div className="px-8 pb-10 space-y-6 animate-in slide-in-from-top-2 duration-300">
                                <div className="h-px bg-slate-800/50 w-full mb-6"></div>
                                <div>
                                   <label className="text-[9px] font-black text-slate-500 uppercase mb-3 block px-1 tracking-widest">Asunto del Correo</label>
                                   <input 
                                    value={temp.subject} 
                                    onChange={(e) => handleTemplateChange(type as LeadType, i, 'subject', e.target.value)} 
                                    className="w-full bg-black/60 border border-slate-800 rounded-xl px-6 py-4 text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all" 
                                    placeholder="Escribe el asunto aquí..."
                                   />
                                </div>
                                <div>
                                   <label className="text-[9px] font-black text-slate-500 uppercase mb-3 block px-1 tracking-widest">Cuerpo del Mensaje</label>
                                   <textarea 
                                    rows={6} 
                                    value={temp.body} 
                                    onChange={(e) => handleTemplateChange(type as LeadType, i, 'body', e.target.value)} 
                                    className="w-full bg-black/60 border border-slate-800 rounded-2xl px-8 py-6 text-base text-slate-300 leading-relaxed font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none custom-scrollbar" 
                                    placeholder="Escribe el contenido del correo. Usa [ContactName], [Company], [MyName] para personalización."
                                   />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
             </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-12 animate-in slide-in-from-bottom-5 duration-500">
              <div className="p-16 bg-[#0f172a] border border-slate-800 rounded-[56px] space-y-12 shadow-2xl">
                <div className="flex items-center space-x-10">
                  <div className="p-6 bg-blue-600 text-white rounded-[28px] shadow-2xl shadow-blue-900/40"><User size={40} /></div>
                  <div>
                    <h3 className="text-4xl font-black uppercase text-white italic tracking-tighter leading-none mb-3">Tu Firma</h3>
                    <p className="text-base font-bold text-slate-500 uppercase tracking-widest">Identidad del remitente</p>
                  </div>
                </div>
                <input value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full bg-black border border-slate-800 rounded-[32px] px-12 py-8 text-2xl font-black text-white focus:outline-none shadow-2xl italic tracking-tighter" />
              </div>
            </div>
          )}
        </div>

        {isSidecarMode && (
          <footer className="h-20 border-t border-slate-900/50 bg-black flex items-center justify-around px-8">
            <button onClick={() => setView('dashboard')} className={`p-3 rounded-2xl ${view === 'dashboard' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><LayoutDashboard size={20} /></button>
            <button onClick={() => setView('leads')} className={`p-3 rounded-2xl ${view === 'leads' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Users size={20} /></button>
            <button onClick={() => setView('templates')} className={`p-3 rounded-2xl ${view === 'templates' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Mail size={20} /></button>
            <button onClick={() => setView('settings')} className={`p-3 rounded-2xl ${view === 'settings' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-600'}`}><Settings size={20} /></button>
          </footer>
        )}
      </main>

      {/* Modal Lead */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl flex items-center justify-center z-50 p-6 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-slate-800 w-full max-w-[550px] rounded-[64px] shadow-2xl p-16 space-y-12">
            <div>
              <h3 className="text-5xl font-black text-white italic uppercase leading-none tracking-tighter mb-4">Capturar Lead</h3>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Ingresa un nuevo contacto</p>
            </div>
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
              setIsAddingLead(false);
            }} className="space-y-8">
              <input required name="name" placeholder="Nombre completo" className="w-full bg-black border border-slate-800 rounded-[28px] px-10 py-6 text-xl font-bold text-white focus:outline-none" />
              <input required name="email" type="email" placeholder="Email corporativo" className="w-full bg-black border border-slate-800 rounded-[28px] px-10 py-6 text-xl font-bold text-white focus:outline-none" />
              <input required name="company" placeholder="Nombre de la empresa" className="w-full bg-black border border-slate-800 rounded-[28px] px-10 py-6 text-xl font-bold text-white focus:outline-none" />
              <select name="type" className="w-full bg-black border border-slate-800 rounded-[28px] px-10 py-6 text-xs font-black text-white uppercase tracking-widest appearance-none">
                <option value="KDM">Key Decision Maker (KDM)</option>
                <option value="Referrer">Referidor / Alianza</option>
              </select>
              <button type="submit" className="w-full py-7 bg-blue-600 text-white rounded-[32px] font-black text-sm uppercase shadow-2xl mt-12 active:scale-95 transition-all tracking-widest">Confirmar Alta</button>
            </form>
            <button onClick={() => setIsAddingLead(false)} className="w-full text-slate-500 font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-colors">Volver</button>
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
