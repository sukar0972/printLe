import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Settings, 
  History, 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Menu,
  Moon,
  Sun,
  Loader2,
  Server,
  Layers,
  Palette,
  Hash
} from 'lucide-react';

// --- Types ---
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
type DuplexMode = 'none' | 'manual' | 'auto';

interface PrintJob {
  id: string;
  fileName: string;
  fileSize: string;
  date: string;
  status: JobStatus;
  printer: string;
}

interface AppSettings {
  printerName: string;
  printerAddress: string; // IPP URL
  serverUrl: string; // Node.js Server URL
  defaultPaperSize: 'Letter' | 'A4' | 'Legal';
  defaultColor: 'Color' | 'Grayscale';
  notifications: boolean;
  theme: 'light' | 'dark';
}

// --- Mock Data Helpers ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'print' | 'history' | 'settings'>('print');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadStage, setUploadStage] = useState<'odd' | 'even' | null>(null);
  const [showFlipPrompt, setShowFlipPrompt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // New Feature State
  const [duplexMode, setDuplexMode] = useState<DuplexMode>('none');
  const [grayscale, setGrayscale] = useState(false);
  const [pageRange, setPageRange] = useState('');

  // Persistent Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('printle_settings');
    return saved ? JSON.parse(saved) : {
      printerName: 'Office Jet Pro',
      printerAddress: 'ipp://192.168.1.50:631/printers/main',
      serverUrl: 'http://localhost:3001',
      defaultPaperSize: 'A4',
      defaultColor: 'Color',
      notifications: true,
      theme: 'light'
    };
  });

  // Print History
  const [history, setHistory] = useState<PrintJob[]>([
    { id: '1', fileName: 'quarterly_report.pdf', fileSize: '2.4 MB', date: new Date(Date.now() - 86400000).toLocaleString(), status: 'completed', printer: 'Office Jet Pro' },
  ]);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('printle_settings', JSON.stringify(settings));
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // --- Handlers ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      resetPrintOptions();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      resetPrintOptions();
    }
  };

  const resetPrintOptions = () => {
    setUploadSuccess(false);
    setErrorMessage(null);
    setDuplexMode('none');
    setGrayscale(false);
    setPageRange('');
  };

  const cycleDuplexMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (duplexMode === 'none') setDuplexMode('manual');
    else if (duplexMode === 'manual') setDuplexMode('auto');
    else setDuplexMode('none');
  };

  const handlePrint = async (stage: 'odd' | 'even' | 'single' = 'single') => {
    if (!file) {
      setErrorMessage("Please select a file to print.");
      return;
    }
    
    if (!settings.serverUrl || settings.serverUrl.trim() === '' || settings.serverUrl.indexOf(':') === -1) {
      setErrorMessage("Print Failed. Please go to Settings and enter the PrintLe Server URL including the port (e.g., http://192.168.1.X:3001).");
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    if (stage === 'odd') setUploadStage('odd');
    if (stage === 'even') setUploadStage('even');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('printerUrl', settings.printerAddress);
      
      // Feature: Page Range
      if (pageRange.trim()) formData.append('pages', pageRange);
      
      // Feature: Grayscale
      if (grayscale) formData.append('grayscale', 'true');

      // Feature: Duplex Logic
      if (duplexMode === 'auto') {
        formData.append('duplex', 'auto'); // Server sends hardware instruction
      } else if (duplexMode === 'manual') {
        // If manual, we tell the server specifically which set to print based on the 'stage'
        if (stage !== 'single') {
          formData.append('duplex', stage);
        } else {
          // Default start for manual is 'odd'
          formData.append('duplex', 'odd');
          setUploadStage('odd');
        }
      }

      const response = await fetch(`${settings.serverUrl}/api/print`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorDetails = `Status: ${response.status} ${response.statusText}`;
        try {
          const errorJson = await response.json();
          errorDetails = errorJson.error || errorDetails;
        } catch (e) {}
        throw new Error(`Server Response Error: ${errorDetails}`);
      }

      const result = await response.json();
      console.log('Print result:', result);

      setIsUploading(false);
      setUploadStage(null);

      // Manual Duplex Flow
      if (duplexMode === 'manual') {
        if (stage === 'single' || stage === 'odd') {
          setShowFlipPrompt(true);
          return;
        }
        if (stage === 'even') {
          setShowFlipPrompt(false);
        }
      }

      setUploadSuccess(true);
      
      const newJob: PrintJob = {
        id: generateId(),
        fileName: file.name,
        fileSize: formatBytes(file.size),
        date: new Date().toLocaleString(),
        status: 'queued', 
        printer: settings.printerName
      };

      setHistory(prev => [newJob, ...prev]);
      
      setTimeout(() => {
        setHistory(prev => prev.map(j => j.id === newJob.id ? {...j, status: 'completed'} : j));
      }, 5000);

      setTimeout(() => {
        setFile(null);
        resetPrintOptions();
      }, 3000);

    } catch (error: any) {
      console.error('Print failed:', error);
      setIsUploading(false);
      setUploadStage(null);
      const url = settings.serverUrl || 'N/A';
      const detail = error.message || 'Unknown network error.';
      setErrorMessage(`Print Failed. Details: ${detail}. Check Server URL: ${url}`);
    }
  };

  const startPrintProcess = () => {
    if (duplexMode === 'manual') {
      handlePrint('odd');
    } else {
      handlePrint('single'); // 'single' handles 'none' and 'auto' logic inside handlePrint
    }
  };

  // --- Components ---

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex flex-col items-center justify-center w-full py-3 space-y-1 transition-colors duration-200
        ${activeTab === id 
          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800' 
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
    >
      <Icon size={24} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  return (
    <div className={`min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors duration-300 font-sans text-slate-900 dark:text-slate-100 ${settings.theme}`}>
      
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm z-10 sticky top-0 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Printer className="text-white" size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PrintLe</h1>
        </div>
        <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${settings.printerAddress ? 'bg-green-500' : 'bg-red-500'}`} title="Server Status" />
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              {settings.printerAddress ? 'Online' : 'Offline'}
            </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 sm:pb-6 max-w-3xl mx-auto w-full relative">
        
        {activeTab === 'print' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="text-center space-y-2 mb-8">
              <h2 className="text-2xl font-bold">Upload & Print</h2>
              <p className="text-slate-500 dark:text-slate-400">Send documents directly to your configured IPP printer.</p>
            </div>
            
            {errorMessage && (
                <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-4 rounded-xl flex items-start gap-3 border border-red-300">
                    <AlertCircle size={20} className="mt-0.5 shrink-0" />
                    <div className="text-sm font-medium break-words">
                        {errorMessage}
                    </div>
                    <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-500 hover:text-red-700 p-1 rounded-full shrink-0">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Upload Zone */}
            <div 
              className={`relative group border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 ease-in-out cursor-pointer
                ${dragActive 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500'
                }
                ${file ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : ''}
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !file && document.getElementById('file-upload')?.click()}
            >
              <input 
                id="file-upload"
                type="file" 
                className="hidden" 
                onChange={handleChange} 
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              />
              
              {isUploading ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="animate-spin text-blue-600" size={48} />
                  <p className="font-medium text-lg">
                    {uploadStage === 'odd' ? 'Printing Odd Pages...' : 
                     uploadStage === 'even' ? 'Printing Even Pages...' : 
                     'Sending to Server...'}
                  </p>
                </div>
              ) : uploadSuccess ? (
                <div className="flex flex-col items-center space-y-4 text-green-600 dark:text-green-400">
                  <CheckCircle size={56} />
                  <div className="space-y-1">
                    <p className="font-bold text-xl">Sent to Printer!</p>
                    <p className="text-sm opacity-80">Check history for status</p>
                  </div>
                </div>
              ) : file ? (
                <div className="flex flex-col items-center space-y-4 relative z-10 w-full">
                   {/* File Preview Card */}
                   <div className="bg-blue-100 dark:bg-slate-700 p-4 rounded-xl relative w-full max-w-sm mx-auto flex items-center gap-3 shadow-sm">
                      <div className="shrink-0">
                         {file.type.includes('image') ? <ImageIcon className="text-blue-600 dark:text-blue-400" size={32} /> : <FileText className="text-blue-600 dark:text-blue-400" size={32} />}
                      </div>
                      <div className="min-w-0 text-left flex-1">
                        <p className="font-semibold text-sm truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFile(null); resetPrintOptions(); }}
                        className="bg-white/50 dark:bg-black/20 hover:bg-red-500 hover:text-white rounded-full p-1.5 transition-colors"
                      >
                        <X size={16} />
                      </button>
                   </div>
                   
                   {/* Print Options Grid - ENHANCED VISUALS */}
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md mx-auto mt-2" onClick={(e) => e.stopPropagation()}>
                       
                       {/* Duplex Toggle */}
                       <div 
                         onClick={cycleDuplexMode}
                         className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer select-none shadow-sm
                           ${duplexMode !== 'none' 
                             ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' 
                             : 'border-transparent bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750'}`}
                       >
                          <Layers size={24} className={duplexMode !== 'none' ? 'text-blue-600' : 'text-slate-400'} />
                          <div className="text-left">
                              <p className="text-xs font-bold uppercase tracking-wider opacity-60">Duplex Mode</p>
                              <p className="text-sm font-bold">
                                {duplexMode === 'none' && 'Off (Single Side)'}
                                {duplexMode === 'manual' && 'Manual Flip'}
                                {duplexMode === 'auto' && 'Automatic'}
                              </p>
                          </div>
                       </div>

                       {/* Grayscale Toggle */}
                       <div 
                         onClick={() => setGrayscale(!grayscale)}
                         className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer select-none shadow-sm
                           ${grayscale 
                             ? 'border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100' 
                             : 'border-transparent bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750'}`}
                       >
                          <Palette size={24} className={grayscale ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'} />
                          <div className="text-left">
                              <p className="text-xs font-bold uppercase tracking-wider opacity-60">Color Mode</p>
                              <p className="text-sm font-bold">{grayscale ? 'Grayscale' : 'Color'}</p>
                          </div>
                       </div>

                       {/* Page Range Input */}
                       <div className="sm:col-span-2 flex items-center gap-3 p-4 rounded-xl border-2 border-transparent bg-white dark:bg-slate-800 shadow-sm">
                          <Hash size={24} className="text-slate-400" />
                          <div className="flex-1 text-left">
                              <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1">Page Range</p>
                              <input 
                                type="text"
                                placeholder="e.g. 1-3, 5 (Leave empty for All)"
                                value={pageRange}
                                onChange={(e) => setPageRange(e.target.value)}
                                className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0 placeholder-slate-300 dark:placeholder-slate-600"
                              />
                          </div>
                       </div>
                   </div>

                   <div className="flex items-center gap-2 pt-4 w-full justify-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); startPrintProcess(); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg shadow-blue-500/30 transition-transform active:scale-95 flex items-center gap-2 w-full max-w-md justify-center"
                      >
                        <Printer size={18} />
                        Print Now
                      </button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-full">
                    <UploadCloud className="text-slate-400 dark:text-slate-300" size={40} />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                      Tap to upload or drag & drop
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      PDF, PNG, JPG, DOCX up to 10MB
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Server Status Card */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Target Device</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg">
                    <Server size={20} className="text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="font-medium">{settings.printerName}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[150px] sm:max-w-xs">{settings.printerAddress}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className="text-blue-600 text-sm font-medium hover:underline"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- HISTORY TAB --- */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6">Print History</h2>
            
            {history.length === 0 ? (
              <div className="text-center py-12">
                <History className="mx-auto text-slate-300 mb-4" size={48} />
                <p className="text-slate-500">No print jobs yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((job) => (
                  <div key={job.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                       <div className={`p-2 rounded-lg shrink-0 
                          ${job.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 
                            job.status === 'failed' ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 
                            'bg-blue-100 text-blue-600 dark:bg-blue-900/30'}`}>
                          {job.status === 'processing' || job.status === 'queued' ? <Loader2 size={20} className="animate-spin" /> : 
                           job.status === 'failed' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                       </div>
                       <div className="min-w-0">
                         <p className="font-semibold truncate">{job.fileName}</p>
                         <p className="text-xs text-slate-500">{job.date} • {job.fileSize}</p>
                       </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase tracking-wide shrink-0
                      ${job.status === 'completed' ? 'bg-green-50 text-green-600' : 
                        job.status === 'failed' ? 'bg-red-50 text-red-600' : 
                        'bg-blue-50 text-blue-600'}`}>
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- SETTINGS TAB --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>

            {/* Printer Config Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-semibold flex items-center gap-2">
                  <Printer size={18} /> Printer Configuration
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Printer Friendly Name</label>
                  <input 
                    type="text" 
                    value={settings.printerName}
                    onChange={(e) => setSettings({...settings, printerName: e.target.value})}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">PrintLe Server URL</label>
                  <input 
                    type="text" 
                    value={settings.serverUrl}
                    onChange={(e) => setSettings({...settings, serverUrl: e.target.value})}
                    placeholder="http://192.168.1.X:3001"
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">The IP address of the computer running 'node server.js'.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IPP Address</label>
                  <input 
                    type="text" 
                    value={settings.printerAddress}
                    onChange={(e) => setSettings({...settings, printerAddress: e.target.value})}
                    placeholder="ipp://192.168.1.xxx:631/printers/..."
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Enter the network path to your IPP enabled printer.</p>
                </div>
              </div>
            </div>

            {/* App Preferences */}
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-semibold flex items-center gap-2">
                  <Menu size={18} /> App Preferences
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Dark Mode</span>
                  <button 
                    onClick={() => setSettings({...settings, theme: settings.theme === 'light' ? 'dark' : 'light'})}
                    className={`p-2 rounded-lg transition-colors ${settings.theme === 'dark' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                  >
                    {settings.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Manual Duplex Prompt Modal */}
      {showFlipPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6 text-center border border-slate-200 dark:border-slate-700">
            <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Layers size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Flip Pages & Reload</h3>
              <p className="text-slate-500 dark:text-slate-400">
                The odd pages have been sent. Once they finish printing, flip the stack and place it back in the tray.
              </p>
            </div>
            <button 
              onClick={() => handlePrint('even')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Continue (Print Even Pages)
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 w-full bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-around items-center z-20 pb-safe">
        <TabButton id="print" label="Print" icon={Printer} />
        <TabButton id="history" label="History" icon={History} />
        <TabButton id="settings" label="Settings" icon={Settings} />
      </nav>
      
      {/* Spacer for bottom nav */}
      <div className="h-16"></div>

    </div>
  );
}
