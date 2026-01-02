
import React, { useState, useEffect, useMemo } from 'react';
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
  Globe
} from 'lucide-react';

// --- Configuration & Constants ---
const AI_MODEL = 'gemini-3-flash-preview';

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
    {
      subject: "Propuesta de valor tecnológica para [Company]",
      body: "Hola [ContactName],\n\nTe contacto de HakaLab. He estado siguiendo el crecimiento de [Company] y creo que nuestra experiencia en desarrollo de software de alta escala podría ayudarles a optimizar sus procesos actuales.\n\n¿Tendrías 10 minutos esta semana?\n\nSaludos,\n[MyName]\nHakaLab"
    },
    {
      subject: "Re: Propuesta de valor tecnológica para [Company]",
      body: "Hola [ContactName],\n\nSolo quería dar seguimiento a mi correo anterior. Entiendo que debes estar muy ocupado liderando [Company].\n\nSi el momento no es el adecuado ahora, ¿hay alguien más en tu equipo con quien deba hablar sobre innovación técnica?\n\nQuedo atento,\n[MyName]"
    },
    {
      subject: "Ideas para el roadmap técnico de [Company]",
      body: "Hola [ContactName],\n\nSigo pensando en los retos de [Company]. Te comparto un breve caso de éxito de HakaLab que creo que resuena con lo que están construyendo.\n\n¿Te parecería conversar el próximo martes?\n\nSaludos,\n[MyName]"
    },
    {
      subject: "Hasta la próxima - HakaLab",
      body: "Hola [ContactName],\n\nTe escribo este último correo para cerrar el hilo por ahora. No quiero ser una molestia en tu bandeja de entrada.\n\nÉxito,\n[MyName]"
    }
  ],
  Referrer: [
    {
      subject: "Consulta rápida: Alianza estratégica HakaLab",
      body: "Hola [ContactName],\n\nEspero que todo vaya excelente. Valoro mucho tu red de contactos.\n\nEstamos expandiendo HakaLab y buscamos llegar a empresas que necesiten un partner tecnológico serio.\n\n¿Hablamos?\n\nUn abrazo,\n[MyName]"
    },
    {
      subject: "Seguimiento: Referidos HakaLab",
      body: "Hola [ContactName],\n\n¿Pudiste ver mi correo anterior sobre la red de referidores de HakaLab?\n\nSaludos,\n[MyName]"
    },
    {
      subject: "Actualización de HakaLab",
      body: "Hola [ContactName],\n\nTe comparto las últimas novedades de HakaLab para tu red.\n\nSeguimos en contacto,\n[MyName]"
    },
    {
      subject: "Gracias por tu tiempo",
      body: "Hola [ContactName],\n\nGracias por estar en mi red.\n\nUn saludo,\n[MyName]"
    }
  ]
};

// Mock data for Google Contacts simulation
const MOCK_GOOGLE_CONTACTS: GoogleContact[] = [
  { id: '1', name: 'Andrés Mendoza', email: 'amendoza@fintech.co', photoUrl: 'https://i.pravatar.cc/150?u=1', company: 'FinTech Co' },
  { id: '2', name: 'Beatriz Silva', email: 'bsilva@creative-agency.com', photoUrl: 'https://i.pravatar.cc/150?u=2', company: 'Creative Agency' },
  { id: '3', name: 'Carlos Ruiz', email: 'cruiz@logistics-plus.net', photoUrl: 'https://i.pravatar.cc/150?u=3', company: 'Logistics Plus' },
  { id: '4', name: 'Diana Torres', email: 'dtorres@health-tech.io', photoUrl: 'https://i.pravatar.cc/150?u=4', company: 'HealthTech' },
  { id: '5', name: 'Eduardo Lara', email: 'elara@retail-hub.mx', photoUrl: 'https://i.pravatar.cc/150?u=5', company: 'Retail Hub' },
  { id: '6', name: 'Fernanda Ortiz', email: 'fortiz@energy-solutions.cl', photoUrl: 'https://i.pravatar.cc/150?u=6', company: 'Energy Solutions' },
];

function HakaTracker() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('hakalab_leads_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [view, setView] = useState<'dashboard' | 'leads' | 'templates'>('dashboard');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('hakalab_leads_v2', JSON.stringify(leads));
  }, [leads]);

  const getNextActionDate = (lead: Lead) => {
    if (lead.status !== 'Active') return null;
    if (lead.currentStep === 0) return new Date(lead.createdAt);
    const lastDate = lead.lastActionDate ? new Date(lead.lastActionDate) : new Date(lead.createdAt);
    const nextStepConfig = STEPS_CONFIG.find(s => s.step === lead.currentStep + 1);
    if (!nextStepConfig) return null;
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + nextStepConfig.waitDays);
    return nextDate;
  };

  const leadsRequiringAction = useMemo(() => {
    const now = new Date();
    return leads.filter(lead => {
      const nextDate = getNextActionDate(lead);
      return nextDate && nextDate <= now && lead.status === 'Active';
    });
  }, [leads]);

  const toggleContactSelection = (id: string) => {
    const newSelection = new Set(selectedContacts);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedContacts(newSelection);
  };

  const importContacts = (type: LeadType) => {
    const toImport = MOCK_GOOGLE_CONTACTS.filter(c => selectedContacts.has(c.id));
    const newLeads: Lead[] = toImport.map(c => ({
      id: crypto.randomUUID(),
      name: c.name,
      email: c.email,
      company: c.company || 'Unknown',
      type: type,
      status: 'Active',
      currentStep: 0,
      lastActionDate: null,
      createdAt: new Date().toISOString(),
    }));

    setLeads([...newLeads, ...leads]);
    setIsSyncingContacts(false);
    setSelectedContacts(new Set());
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
    if (confirm('¿Eliminar contacto?')) {
      setLeads(leads.filter(l => l.id !== id));
    }
  };

  const addLead = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newLead: Lead = {
      id: crypto.randomUUID(),
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      company: formData.get('company') as string,
      type: formData.get('type') as LeadType,
      status: 'Active',
      currentStep: 0,
      lastActionDate: null,
      createdAt: new Date().toISOString(),
    };
    setLeads([newLead, ...leads]);
    setIsAddingLead(false);
  };

  const generateAIEmail = async (lead: Lead) => {
    setAiLoading(lead.id);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentTemplate = TEMPLATES[lead.type][lead.currentStep];
      const prompt = `Personaliza este correo de ventas para HakaLab.
      Contacto: ${lead.name} de ${lead.company}. Tipo: ${lead.type}. Etapa: ${lead.currentStep + 1} de 4.
      Plantilla: ${currentTemplate.body}
      Sé profesional y directo. Devuelve SOLO el cuerpo del mensaje.`;
      const response = await ai.models.generateContent({ model: AI_MODEL, contents: prompt });
      const body = response.text || currentTemplate.body;
      const subject = currentTemplate.subject.replace('[Company]', lead.company);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
      advanceStep(lead.id);
    } catch (err) { alert("Error con Gemini."); } finally { setAiLoading(null); }
  };

  const openGmailRaw = (lead: Lead) => {
    const template = TEMPLATES[lead.type][lead.currentStep] || TEMPLATES[lead.type][0];
    const body = template.body.replace('[ContactName]', lead.name).replace('[Company]', lead.company).replace('[MyName]', 'Equipo HakaLab');
    const subject = template.subject.replace('[Company]', lead.company);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    advanceStep(lead.id);
  };

  const filteredContacts = MOCK_GOOGLE_CONTACTS.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const NavButton = ({ id, icon: Icon, label }: { id: typeof view, icon: any, label: string }) => (
    <button onClick={() => setView(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-300 ${view === id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'}`}>
      <Icon size={20} />
      <span className="font-semibold text-sm tracking-tight">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-900 bg-slate-950/60 backdrop-blur-xl p-6 flex flex-col z-20">
        <div className="flex items-center space-x-3 mb-12 px-2">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-blue-900/30">
            <LayoutDashboard size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter text-white">HAKALAB</h1>
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] leading-none">Crm Engine</p>
          </div>
        </div>

        <div className="space-y-2 flex-1">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] px-4 mb-4">Menú Principal</p>
          <NavButton id="dashboard" icon={Calendar} label="Acciones Hoy" />
          <NavButton id="leads" icon={Users} label="Base de Contactos" />
          <NavButton id="templates" icon={Mail} label="Flujos de Email" />
          
          <div className="mt-8 px-4 py-4 bg-slate-900/40 rounded-2xl border border-slate-800/50">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Google Sync</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Conectado a Google Workspace.</p>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-900 mt-auto">
          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-2xl text-slate-500 hover:text-slate-100 transition-colors">
            <Settings size={20} />
            <span className="font-semibold text-sm">Ajustes</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-24 flex items-center justify-between px-10 border-b border-slate-900/50 bg-slate-950/40 backdrop-blur-md z-10">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight capitalize">
              {view === 'dashboard' ? 'Recordatorios' : view === 'leads' ? 'Contactos' : 'Plantillas'}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Gestión avanzada de prospectos.</p>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setIsSyncingContacts(true)}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-6 py-3 rounded-2xl flex items-center space-x-2 transition-all border border-slate-800 font-bold active:scale-95"
            >
              <Globe size={18} className="text-blue-500" />
              <span>Google Contacts</span>
            </button>
            <button 
              onClick={() => setIsAddingLead(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl flex items-center space-x-2 transition-all shadow-2xl shadow-blue-900/40 font-bold active:scale-95 group"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              <span>Nuevo Manual</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar relative">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
          
          {view === 'dashboard' && (
            <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/40 border border-slate-800/60 p-8 rounded-[2rem] backdrop-blur-sm group hover:border-blue-500/30 transition-all">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-blue-400">Pendientes Hoy</p>
                  <p className="text-5xl font-black text-white tracking-tighter">{leadsRequiringAction.length}</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/60 p-8 rounded-[2rem] backdrop-blur-sm">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">En Secuencia</p>
                  <p className="text-5xl font-black text-blue-500 tracking-tighter">{leads.filter(l => l.status === 'Active').length}</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/60 p-8 rounded-[2rem] backdrop-blur-sm">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Éxito Comercial</p>
                  <p className="text-5xl font-black text-emerald-500 tracking-tighter">{leads.filter(l => l.status === 'Converted').length}</p>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-md">
                <div className="px-10 py-6 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                  <h3 className="font-black text-lg flex items-center space-x-3 tracking-tight text-white">
                    <AlertCircle size={22} className="text-orange-400" />
                    <span>Tareas Prioritarias</span>
                  </h3>
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full border border-blue-500/20 uppercase tracking-widest">Workspace Sync</span>
                </div>

                {leadsRequiringAction.length === 0 ? (
                  <div className="p-32 text-center">
                    <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/20">
                      <CheckCircle2 size={48} className="text-emerald-500/30" />
                    </div>
                    <h4 className="text-2xl font-black text-slate-200 tracking-tight">Bandeja de salida limpia</h4>
                    <p className="text-slate-500 mt-2 font-medium">No hay seguimientos programados para este momento.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {leadsRequiringAction.map(lead => (
                      <div key={lead.id} className="p-10 flex items-center justify-between hover:bg-slate-800/40 transition-all group">
                        <div className="flex items-center space-x-6 text-white">
                          <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center text-2xl font-black shadow-inner border border-slate-800 ${
                            lead.type === 'KDM' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {lead.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="text-xl font-black tracking-tight group-hover:text-blue-400 transition-colors leading-none mb-2">{lead.name}</h4>
                            <p className="text-slate-400 font-semibold">{lead.company} <span className="text-slate-600 font-bold mx-2">/</span> <span className="text-slate-500 uppercase text-[10px] tracking-widest">{lead.type}</span></p>
                            <div className="mt-3 inline-flex items-center space-x-2 bg-slate-950/50 px-3 py-1 rounded-lg border border-slate-800">
                               <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Paso {lead.currentStep + 1}: {STEPS_CONFIG[lead.currentStep].label}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <button disabled={aiLoading === lead.id} onClick={() => generateAIEmail(lead)} className="h-14 px-8 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-white transition-all flex items-center space-x-3 disabled:opacity-50 shadow-xl shadow-indigo-900/30 font-bold active:scale-95">
                            {aiLoading === lead.id ? <Loader2 className="animate-spin h-6 w-6" /> : <><Sparkles size={20} /><span>Personalizar IA</span></>}
                          </button>
                          <button onClick={() => openGmailRaw(lead)} className="h-14 w-14 flex items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 transition-all border border-slate-700 active:scale-95 group/btn">
                            <Send size={24} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'leads' && (
            <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-md">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/30 border-b border-slate-800 text-white">
                    <tr>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Contacto</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Empresa</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Tipo</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Secuencia</th>
                      <th className="px-10 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {leads.map(lead => (
                      <tr key={lead.id} className="hover:bg-slate-800/20 transition-colors group">
                        <td className="px-10 py-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-white text-lg tracking-tight group-hover:text-blue-400 transition-colors">{lead.name}</span>
                            <span className="text-xs text-slate-500 font-medium">{lead.email}</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-white font-bold">{lead.company}</td>
                        <td className="px-10 py-6">
                          <span className={`text-[9px] font-black px-3 py-1 rounded-lg border uppercase tracking-widest ${lead.type === 'KDM' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{lead.type}</span>
                        </td>
                        <td className="px-10 py-6 text-white">
                          <div className="flex items-center space-x-4">
                            <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full transition-all duration-1000" style={{ width: `${(lead.currentStep / 4) * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-slate-500">{lead.currentStep}/4</span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <button onClick={() => deleteLead(lead.id)} className="text-slate-600 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={20} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === 'templates' && (
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-500 pb-20">
              {Object.entries(TEMPLATES).map(([type, templates]) => (
                <div key={type} className="space-y-8">
                  <h2 className="text-2xl font-black flex items-center space-x-4 text-white uppercase tracking-tight">
                    <div className={`w-4 h-4 rounded-full ${type === 'KDM' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    <span>Flujo {type}</span>
                  </h2>
                  <div className="space-y-6">
                    {templates.map((t, idx) => (
                      <div key={idx} className="bg-slate-900/40 border border-slate-800/60 p-10 rounded-[2.5rem] relative group shadow-xl">
                        <div className="absolute top-0 right-0 bg-slate-800/80 px-6 py-2 text-[10px] font-black text-slate-400 rounded-bl-[1.5rem] uppercase tracking-widest">PASO {idx + 1}</div>
                        <h4 className="text-blue-400 font-black mb-6 text-sm uppercase flex items-center"><Mail className="mr-2" size={16} />Asunto: {t.subject}</h4>
                        <div className="bg-slate-950/60 p-8 rounded-3xl border border-slate-800/50 shadow-inner"><p className="text-slate-400 text-sm whitespace-pre-wrap leading-relaxed font-medium">{t.body}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Google Contacts Picker Modal */}
      {isSyncingContacts && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center z-50 p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-slate-900 border border-slate-800/60 w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden ring-1 ring-slate-800 flex flex-col h-[85vh]">
            <div className="p-10 border-b border-slate-800 bg-slate-800/10 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                  <svg viewBox="0 0 24 24" width="28" height="28"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tighter">Explorador de Contactos</h3>
                  <p className="text-slate-500 text-xs font-semibold">Workspace de HakaLab conectado <ShieldCheck className="inline ml-1 text-emerald-500" size={14} /></p>
                </div>
              </div>
              <div className="relative w-72">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar en Google..." 
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-2 gap-4 custom-scrollbar">
              {filteredContacts.map(contact => (
                <div 
                  key={contact.id} 
                  onClick={() => toggleContactSelection(contact.id)}
                  className={`p-6 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${
                    selectedContacts.has(contact.id) 
                      ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-900/20' 
                      : 'bg-slate-800/30 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <img src={contact.photoUrl} className="w-12 h-12 rounded-2xl object-cover ring-2 ring-slate-900 group-hover:scale-105 transition-transform" />
                    <div>
                      <h4 className="font-bold text-white text-sm">{contact.name}</h4>
                      <p className="text-[11px] text-slate-500 font-medium">{contact.email}</p>
                      <p className="text-[10px] text-blue-500 font-bold mt-1">{contact.company}</p>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedContacts.has(contact.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-700'
                  }`}>
                    {selectedContacts.has(contact.id) && <Check size={16} className="text-white" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-slate-800/30 border-t border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-sm font-semibold">{selectedContacts.size} contactos seleccionados</span>
              <div className="flex space-x-4">
                <button onClick={() => setIsSyncingContacts(false)} className="px-6 py-3 text-slate-500 hover:text-white font-bold text-xs uppercase tracking-widest transition-colors">Cancelar</button>
                <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-xl">
                  <button 
                    disabled={selectedContacts.size === 0}
                    onClick={() => importContacts('KDM')}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                  >
                    Importar KDM
                  </button>
                  <div className="w-[1px] bg-slate-800 mx-1.5" />
                  <button 
                    disabled={selectedContacts.size === 0}
                    onClick={() => importContacts('Referrer')}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                  >
                    Como Referidor
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal (Manual) */}
      {isAddingLead && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center z-50 p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-slate-900 border border-slate-800/60 w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden ring-1 ring-slate-800">
            <div className="p-12 border-b border-slate-800 bg-slate-800/10">
              <h3 className="text-4xl font-black text-white tracking-tighter">Registro Manual</h3>
              <p className="text-slate-500 mt-2 font-semibold">Añade un contacto fuera de tu Workspace.</p>
            </div>
            <form onSubmit={addLead} className="p-12 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Nombre</label>
                  <input required name="name" className="w-full bg-slate-800/30 border border-slate-700/50 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Email</label>
                  <input required name="email" type="email" className="w-full bg-slate-800/30 border border-slate-700/50 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest text-white">Empresa</label>
                  <input required name="company" className="w-full bg-slate-800/30 border border-slate-700/50 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Tipo de Campaña</label>
                  <select name="type" className="w-full bg-slate-800/30 border border-slate-700/50 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold cursor-pointer">
                    <option value="KDM">Key Decision Maker</option>
                    <option value="Referrer">Referidor</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-6 pt-10">
                <button type="button" onClick={() => setIsAddingLead(false)} className="flex-1 px-8 py-5 border border-slate-700 rounded-[1.5rem] text-slate-400 hover:bg-slate-800 font-black uppercase tracking-widest transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-8 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-[1.5rem] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-blue-900/30">Activar Seguimiento</button>
              </div>
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
