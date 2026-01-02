
import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  setDoc, 
  doc, 
  query, 
  orderBy, 
  onSnapshot,
  Firestore,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";

import { 
  Users, 
  Send, 
  Calendar, 
  Plus, 
  Mail, 
  Sparkles,
  LayoutDashboard,
  Settings,
  Maximize2,
  Minimize2,
  Loader2,
  Clock,
  MessageSquare,
  ExternalLink,
  Hourglass,
  Building2
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

// Global DB reference
let _db: Firestore | null = null;

const getDb = (): Firestore | null => {
  if (_db) return _db;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    _db = getFirestore(app);
    return _db;
  } catch (e) {
    console.error("Firestore initialization error:", e);
    return null;
  }
};

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

const DEFAULT_TEMPLATES = {
  KDM: [
    { step: 1, title: "Presentación HakaLab", subject: "Propuesta para [Company]", body: "Hola [ContactName], soy de HakaLab..." },
    { step: 2, title: "Seguimiento", subject: "Re: Propuesta para [Company]", body: "Hola [ContactName], ¿pudiste ver mi anterior correo?" }
  ],
  Referrer: [
    { step: 1, title: "Alianza", subject: "Alianza HakaLab", body: "Hola [ContactName], te contacto por una alianza..." }
  ]
};

const STEPS_CONFIG = [
  { step: 1, label: 'Primer Contacto', waitDays: 0 },
  { step: 2, label: 'Seguimiento 1', waitDays: 2 },
  { step: 3, label: 'Seguimiento 2', waitDays: 4 },
  { step: 4, label: 'Cierre', waitDays: 7 },
];

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName] = useState(() => localStorage.getItem('hakalab_user_name') || 'Tu Nombre');
  const [view, setView] = useState<'dashboard' | 'leads' | 'companies' | 'templates' | 'settings'>('dashboard');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isSidecarMode, setIsSidecarMode] = useState(false);
  
  useEffect(() => {
    const db = getDb();
    if (!db) {
      setIsLoading(false);
      return;
    }

    const unsubLeads = onSnapshot(
      query(collection(db, "leads"), orderBy("createdAt", "desc")), 
      (snap: QuerySnapshot<DocumentData>) => {
        const leadsData = snap.docs.map(docSnap => {
          const data = docSnap.data();
          return { ...data, id: docSnap.id } as Lead;
        });
        setLeads(leadsData);
        setIsLoading(false);
      }, 
      (error) => {
        console.error("Firestore sync error:", error);
        setIsLoading(false);
      }
    );

    return () => unsubLeads();
  }, []);

  const dashboardData = useMemo(() => {
    const activeLeads = leads.filter(l => l.status === 'Active');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newProspects = activeLeads.filter(l => l.currentStep === 0);
    const replied = leads.filter(l => l.status === 'Replied');

    const toSendToday = activeLeads.filter(l => {
      if (l.currentStep === 0) return false;
      const lastAction = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepIndex = l.currentStep;
      const nextStepConfig = STEPS_CONFIG[nextStepIndex];
      if (!nextStepConfig) return false;
      
      const dueDate = new Date(lastAction);
      dueDate.setDate(dueDate.getDate() + nextStepConfig.waitDays);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate <= today;
    });

    const inProgress = activeLeads.filter(l => l.currentStep > 0 && l.currentStep < 4).map(l => {
      const lastAction = l.lastActionDate ? new Date(l.lastActionDate) : new Date(l.createdAt);
      const nextStepConfig = STEPS_CONFIG[l.currentStep];
      const dueDate = new Date(lastAction);
      if (nextStepConfig) dueDate.setDate(dueDate.getDate() + nextStepConfig.waitDays);
      const diff = Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
      return { ...l, diffDays: diff };
    });

    return { newProspects, toSendToday, inProgress, replied };
  }, [leads]);

  const syncLead = async (lead: Lead) => {
    const db = getDb();
    if (!db) return;
    try {
      await setDoc(doc(db, "leads", lead.id), lead);
    } catch (e) {
      console.error("Error saving lead:", e);
    }
  };

  const openGmail = (lead: Lead) => {
    const typeTemplates = DEFAULT_TEMPLATES[lead.type as keyof typeof DEFAULT_TEMPLATES] || DEFAULT_TEMPLATES.KDM;
    const template = typeTemplates[lead.currentStep] || typeTemplates[0];
    const subject = template.subject.replace('[Company]', lead.company);
    const body = template.body.replace('[ContactName]', lead.name).replace('[MyName]', userName);
    
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    
    const updatedLead: Lead = {
      ...lead,
      currentStep: lead.currentStep + 1,
      lastActionDate: new Date().toISOString(),
      status: lead.currentStep + 1 >= 4 ? 'Converted' : 'Active'
    };
    syncLead(updatedLead);
  };

  return (
    <div className="flex h-screen bg-black text-slate-100 overflow-hidden">
      {!isSidecarMode && (
        <aside className="w-64 border-r border-slate-900 bg-[#020617] p-6 flex flex-col z-20">
          <div className="flex items-center space-x-3 mb-10 px-2">
            <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg"><LayoutDashboard size={20} className="text-white" /></div>
            <h1 className="text-sm font-black tracking-tighter text-white uppercase italic">Haka Tracker</h1>
          </div>
          <nav className="space-y-1.5 flex-1">
            <button onClick={() => setView('dashboard')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${view === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}>
              <Calendar size={18} /> <span className="font-bold text-xs uppercase tracking-wider">Dashboard</span>
            </button>
            <button onClick={() => setView('leads')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${view === 'leads' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800/50'}`}>
              <Users size={18} /> <span className="font-bold text-xs uppercase tracking-wider">Prospectos</span>
            </button>
          </nav>
          <button onClick={() => setIsSidecarMode(true)} className="mt-4 flex items-center justify-between px-5 py-3 rounded-2xl bg-slate-900/40 border border-slate-800/50 text-slate-400">
            <span className="text-[10px] font-bold uppercase">Minimizar</span> <Minimize2 size={14} />
          </button>
        </aside>
      )}

      <main className="flex-1 flex flex-col bg-black relative">
        <header className="flex items-center justify-between px-10 h-24 border-b border-slate-900/30">
          <div className="flex items-center">
            {isSidecarMode && <button onClick={() => setIsSidecarMode(false)} className="p-3 bg-slate-900/50 rounded-2xl text-slate-400 mr-6"><Maximize2 size={16} /></button>}
            <h2 className="font-black text-white text-3xl tracking-tighter uppercase italic">{String(view)}</h2>
          </div>
          <button onClick={() => setIsAddingLead(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3">
            <Plus size={18} /> <span>Nuevo Lead</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center">
              <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sincronizando...</p>
            </div>
          ) : view === 'dashboard' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-[1500px] mx-auto">
              <div className="lg:col-span-8 space-y-8">
                <section className="space-y-4">
                  <div className="flex items-center space-x-3"><Sparkles size={16} className="text-blue-400" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Nuevos ({dashboardData.newProspects.length})</h3></div>
                  <div className="bg-[#0f172a] border border-slate-800 rounded-[32px] p-5 shadow-2xl">
                    {dashboardData.newProspects.map(lead => (
                      <div key={lead.id} className="bg-[#1e293b]/50 border border-slate-700/40 p-4 rounded-[24px] flex items-center justify-between mb-3 last:mb-0">
                        <div><h4 className="font-black text-white text-sm">{lead.name}</h4><p className="text-[9px] text-slate-500 font-black uppercase">{lead.company}</p></div>
                        <button onClick={() => openGmail(lead)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center space-x-2"><Send size={14} /><span>Enviar</span></button>
                      </div>
                    ))}
                    {dashboardData.newProspects.length === 0 && <p className="text-center py-4 text-slate-600 text-xs">No hay prospectos nuevos</p>}
                  </div>
                </section>
                
                <section className="space-y-4">
                  <div className="flex items-center space-x-3"><Clock size={16} className="text-amber-400" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Seguimientos Hoy ({dashboardData.toSendToday.length})</h3></div>
                  <div className="bg-[#0f172a] border border-slate-800 rounded-[32px] p-5">
                    {dashboardData.toSendToday.map(lead => (
                      <div key={lead.id} className="bg-[#1e293b]/50 p-4 rounded-[24px] flex items-center justify-between mb-3 last:mb-0">
                        <div><h4 className="font-black text-white text-sm">{lead.name}</h4><p className="text-[9px] text-slate-500 font-black uppercase">Paso {lead.currentStep + 1} para {lead.company}</p></div>
                        <button onClick={() => openGmail(lead)} className="bg-amber-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest"><Send size={14} /></button>
                      </div>
                    ))}
                    {dashboardData.toSendToday.length === 0 && <p className="text-center py-4 text-slate-600 text-xs">Todo al día</p>}
                  </div>
                </section>
              </div>

              <div className="lg:col-span-4 space-y-8">
                <section className="space-y-4">
                  <div className="flex items-center space-x-3"><MessageSquare size={16} className="text-emerald-400" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Respuestas ({dashboardData.replied.length})</h3></div>
                  <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-[32px] p-5">
                    {dashboardData.replied.map(lead => (
                      <div key={lead.id} className="bg-white p-4 rounded-[24px] mb-3 last:mb-0 flex justify-between items-center">
                        <div><h4 className="font-black text-slate-900 text-xs">{lead.name}</h4><p className="text-[8px] text-slate-500 uppercase">{lead.company}</p></div>
                        <ExternalLink size={14} className="text-emerald-600 cursor-pointer" onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/from%3A${lead.email}`, '_blank')} />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center space-x-3"><Hourglass size={16} className="text-indigo-400" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Activos ({dashboardData.inProgress.length})</h3></div>
                  <div className="bg-[#0f172a] border border-slate-800 rounded-[32px] p-5 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {dashboardData.inProgress.map(lead => (
                      <div key={lead.id} className="bg-[#1e293b]/40 border border-slate-800/50 p-3.5 rounded-2xl flex items-center justify-between mb-2">
                        <div className="overflow-hidden"><h4 className="font-black text-slate-200 text-[11px] truncate">{lead.name}</h4><p className="text-[8px] text-slate-600 font-black uppercase">{lead.company}</p></div>
                        <div className="text-right"><p className="text-[9px] font-black text-indigo-400 italic">en {lead.diffDays}d</p></div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center opacity-40 text-[10px] font-black uppercase tracking-widest italic">Sección {String(view)} no disponible.</div>
          )}
        </div>
      </main>

      {isAddingLead && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-6">
          <div className="bg-[#0f172a] border border-slate-800 p-10 rounded-[40px] w-full max-w-md">
            <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-6">Nuevo Lead</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const nl: Lead = {
                id: crypto.randomUUID(),
                name: String(f.get('name')),
                email: String(f.get('email')),
                company: String(f.get('company')),
                type: 'KDM',
                status: 'Active',
                currentStep: 0,
                lastActionDate: null,
                createdAt: new Date().toISOString()
              };
              await syncLead(nl);
              setIsAddingLead(false);
            }} className="space-y-4">
              <input required name="name" placeholder="Nombre" className="w-full bg-black border border-slate-800 rounded-xl px-5 py-3 text-sm font-bold text-white focus:outline-none" />
              <input required name="email" type="email" placeholder="Email" className="w-full bg-black border border-slate-800 rounded-xl px-5 py-3 text-sm font-bold text-white focus:outline-none" />
              <input required name="company" placeholder="Empresa" className="w-full bg-black border border-slate-800 rounded-xl px-5 py-3 text-sm font-bold text-white focus:outline-none" />
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl">Registrar</button>
              <button type="button" onClick={() => setIsAddingLead(false)} className="w-full text-slate-500 text-[10px] font-black uppercase tracking-widest pt-2">Cancelar</button>
            </form>
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
