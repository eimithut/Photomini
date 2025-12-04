import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, RotateCw, Wand2, RefreshCcw, Trash2, Image as ImageIcon, Sliders, Zap, MonitorPlay, Info, ShieldCheck, Settings, X, Save, Hand, Paintbrush, Eraser, Grid3X3, Droplets, EyeOff, Sun, Moon, ScanFace, UserX, VenetianMask, BarChart3, Palette, Ghost, ArrowLeftRight, Check, Grid, Scale } from 'lucide-react';
import { Button, ThemeColor } from './components/Button';
import { Slider } from './components/Slider';
import { PaintCanvas } from './components/PaintCanvas';
import { readFileAsBase64, applyFiltersToImage, downloadImage } from './services/imageUtils';
import { editImageWithPhotominiAI } from './services/geminiService';
import { detectFaces } from './services/faceDetectionService';
import { FilterState, DEFAULT_FILTERS, ManualToolType, BrushSettings, DEFAULT_BRUSH_SETTINGS, FaceDetection, PaintCanvasRef, FaceEffectType } from './types';

interface AppSettings {
  exportFormat: 'png' | 'jpeg';
  filenamePrefix: string;
  themeColor: ThemeColor;
  showGrid: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  exportFormat: 'png',
  filenamePrefix: 'photomini-edit',
  themeColor: 'yellow',
  showGrid: false,
};

const DAILY_LIMIT = 250;

// Theme Hex Map for Canvas Drawing (Since Tailwind classes don't work inside Canvas context)
const THEME_HEX_MAP: Record<ThemeColor, string> = {
  yellow: '#eab308',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
};

export default function App() {
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [checkPointImage, setCheckPointImage] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'adjust' | 'manual' | 'ai'>('adjust');
  const [error, setError] = useState<string | null>(null);
  const [estimatedTokens, setEstimatedTokens] = useState(258);
  const [dailyUsage, setDailyUsage] = useState(0);
  
  const [manualTool, setManualTool] = useState<ManualToolType>('brush');
  const [brushSettings, setBrushSettings] = useState<BrushSettings>(DEFAULT_BRUSH_SETTINGS);
  
  const paintCanvasRef = useRef<PaintCanvasRef>(null);
  const [isDetectingFaces, setIsDetectingFaces] = useState(false);
  const [detectedFaces, setDetectedFaces] = useState<FaceDetection[]>([]);

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsTab, setSettingsTab] = useState<'general' | 'legal'>('general');

  // Startup Animation State
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Startup Effect
  useEffect(() => {
    // Start shutter open animation after 2.2 seconds
    const fadeTimer = setTimeout(() => {
        setSplashFading(true);
    }, 2200);

    // Remove from DOM after animation completes (1s transition)
    const removeTimer = setTimeout(() => {
        setShowSplash(false);
    }, 3200);

    return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('photomini_usage_date');
    const savedUsage = parseInt(localStorage.getItem('photomini_usage_count') || '0');

    if (savedDate !== today) {
      setDailyUsage(0);
      localStorage.setItem('photomini_usage_date', today);
      localStorage.setItem('photomini_usage_count', '0');
    } else {
      setDailyUsage(savedUsage);
    }
  }, []);

  const incrementUsage = () => {
    const newUsage = dailyUsage + 1;
    setDailyUsage(newUsage);
    localStorage.setItem('photomini_usage_count', newUsage.toString());
    localStorage.setItem('photomini_usage_date', new Date().toDateString());
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem('photomini_app_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('photomini_app_settings', JSON.stringify(updated));
  };

  useEffect(() => {
    const imageTokens = 258;
    const textTokens = Math.ceil(aiPrompt.length / 4);
    setEstimatedTokens(imageTokens + textTokens);
  }, [aiPrompt]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const base64 = await readFileAsBase64(file);
        setBaseImage(base64);
        setOriginalImage(base64);
        setCheckPointImage(base64);
        setCurrentImage(base64);
        setFilters(DEFAULT_FILTERS);
        setError(null);
        setDetectedFaces([]);
      } catch (err) {
        setError("Failed to load image");
      }
    }
  };

  const handleReset = () => {
    if (originalImage) {
      setBaseImage(originalImage);
      setCheckPointImage(originalImage);
      setCurrentImage(originalImage);
      setFilters(DEFAULT_FILTERS);
      setDetectedFaces([]);
    }
  };

  const handleClear = () => {
    setBaseImage(null);
    setOriginalImage(null);
    setCheckPointImage(null);
    setCurrentImage(null);
    setFilters(DEFAULT_FILTERS);
    setAiPrompt('');
    setDetectedFaces([]);
  };

  const handleManualUpdate = (newImageBase64: string) => {
    setBaseImage(newImageBase64);
  };
  
  const handleDetectFaces = async () => {
    if (!baseImage) return;
    setIsDetectingFaces(true);
    setDetectedFaces([]);
    setError(null);
    
    try {
      const currentCanvasData = paintCanvasRef.current?.getDataUrl() || baseImage;
      const faces = await detectFaces(currentCanvasData);
      
      if (faces.length === 0) {
        setError("No faces detected in the image.");
      } else {
        setDetectedFaces(faces);
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to detect faces. Ensure scripts loaded.");
    } finally {
      setIsDetectingFaces(false);
    }
  };

  const handleApplyFaceEffect = (effect: FaceEffectType) => {
    if (detectedFaces.length === 0) return;
    paintCanvasRef.current?.applyFaceEffects(detectedFaces, effect);
    setDetectedFaces([]);
  };

  const handleAiEdit = async () => {
    if (!baseImage || !aiPrompt.trim()) return;

    if (dailyUsage >= DAILY_LIMIT) {
       setError("Daily limit of 250 requests reached. Please try again tomorrow.");
       return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const flattenedImage = await applyFiltersToImage(baseImage, filters, 'image/png');
      const newImage = await editImageWithPhotominiAI(flattenedImage, aiPrompt);
      
      setBaseImage(newImage);
      setCheckPointImage(newImage);
      setCurrentImage(newImage);
      setFilters(DEFAULT_FILTERS);
      setAiPrompt('');
      setDetectedFaces([]);

      incrementUsage();

    } catch (err: any) {
      setError(err.message || "Failed to generate AI edit. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!baseImage) return;
    try {
      const mimeType = settings.exportFormat === 'png' ? 'image/png' : 'image/jpeg';
      const ext = settings.exportFormat;
      const finalImage = await applyFiltersToImage(baseImage, filters, mimeType, 0.92);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${settings.filenamePrefix}-${timestamp}.${ext}`;
      downloadImage(finalImage, filename);
    } catch (err) {
      setError("Failed to download image");
    }
  };

  const getFilterStyle = () => {
    if (!filters) return {};
    return {
      filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) blur(${filters.blur}px)`,
      transform: `rotate(${filters.rotation}deg)`,
      transition: 'filter 0.2s ease-out, transform 0.3s ease-in-out'
    };
  };

  // Helper for dynamic theme colors
  const theme = settings.themeColor;
  const getTextClass = () => `text-${theme}-500`;
  const getBgClass = () => `bg-${theme}-500`;
  const getBorderClass = () => `border-${theme}-500`;
  
  const themeColors: ThemeColor[] = ['yellow', 'blue', 'green', 'red', 'purple', 'pink', 'orange', 'cyan'];

  return (
    <>
    {/* --- Startup Splash Screen (Shutter Split Animation) --- */}
    {showSplash && (
        <div className="fixed inset-0 z-[100] flex flex-col">
            {/* Top Shutter Panel */}
            <div className={`absolute top-0 left-0 w-full h-1/2 bg-[#09090b] z-20 transition-transform duration-1000 ease-[cubic-bezier(0.87,0,0.13,1)] ${splashFading ? '-translate-y-full' : 'translate-y-0'}`}>
                {/* Border line at the split */}
                <div className={`absolute bottom-0 w-full h-[1px] bg-zinc-800 transition-opacity duration-300 ${splashFading ? 'opacity-0' : 'opacity-100'}`}></div>
            </div>
            
            {/* Bottom Shutter Panel */}
            <div className={`absolute bottom-0 left-0 w-full h-1/2 bg-[#09090b] z-20 transition-transform duration-1000 ease-[cubic-bezier(0.87,0,0.13,1)] ${splashFading ? 'translate-y-full' : 'translate-y-0'}`}>
                 {/* Border line at the split */}
                 <div className={`absolute top-0 w-full h-[1px] bg-zinc-800 transition-opacity duration-300 ${splashFading ? 'opacity-0' : 'opacity-100'}`}></div>
            </div>

            {/* Content Layer */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center z-30 transition-all duration-500 ease-out ${splashFading ? 'opacity-0 scale-90 blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
                <div className="relative mb-6 group">
                    {/* Glowing effect behind logo */}
                    <div className={`absolute inset-0 bg-${theme}-500/30 blur-[40px] rounded-full animate-pulse`}></div>
                    <div className="relative bg-[#18181b] p-6 rounded-2xl border border-zinc-800 shadow-2xl animate-in zoom-in duration-700">
                        <Zap size={64} className={getTextClass()} />
                    </div>
                </div>
                
                <h1 className="text-5xl font-black text-white tracking-tighter mb-2 animate-in slide-in-from-bottom-4 fade-in duration-700 delay-100">
                    Photomini
                </h1>
                
                <div className="flex flex-col items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-700 delay-200">
                    <p className="text-zinc-500 text-sm font-medium">Intelligent Photo Editor</p>
                    <div className="mt-6 flex items-center gap-3 opacity-60">
                        <div className={`h-px w-12 bg-gradient-to-r from-transparent to-${theme}-500`}></div>
                        <span className="text-[10px] font-mono text-zinc-400 tracking-[0.2em] uppercase">
                            Developed by Eimithut
                        </span>
                        <div className={`h-px w-12 bg-gradient-to-l from-transparent to-${theme}-500`}></div>
                    </div>
                </div>
            </div>
        </div>
    )}

    <div className={`h-[100dvh] bg-[#0f0f11] text-zinc-300 flex flex-col md:flex-row overflow-hidden font-sans selection:${getBgClass()} selection:text-black`}>
      
      {/* --- Settings Modal --- */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md m-4 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between p-4 border-b border-zinc-700 shrink-0">
                 <h3 className={`font-bold text-white flex items-center gap-2`}>
                   <Settings size={18} className={getTextClass()} /> Settings
                 </h3>
                 <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white transition-colors">
                    <X size={20} />
                 </button>
              </div>

              {/* Settings Tabs */}
              <div className="flex border-b border-zinc-700 shrink-0">
                  <button 
                     onClick={() => setSettingsTab('general')}
                     className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === 'general' ? `text-white bg-zinc-800 border-b-2 ${getBorderClass()}` : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                     General
                  </button>
                  <button 
                     onClick={() => setSettingsTab('legal')}
                     className={`flex-1 py-3 text-sm font-medium transition-colors ${settingsTab === 'legal' ? `text-white bg-zinc-800 border-b-2 ${getBorderClass()}` : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                     Legal & Privacy
                  </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                 {settingsTab === 'general' ? (
                   <>
                     {/* Theme Color */}
                     <div className="space-y-3">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Interface Theme</label>
                        <div className="flex flex-wrap gap-3">
                           {themeColors.map(color => (
                              <button
                                 key={color}
                                 onClick={() => updateSettings({ themeColor: color })}
                                 className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${settings.themeColor === color ? 'border-white' : 'border-transparent'}`}
                                 style={{ backgroundColor: THEME_HEX_MAP[color] }}
                              >
                                 {settings.themeColor === color && <Check size={14} className="text-white mix-blend-difference" />}
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Display Options */}
                     <div className="space-y-3">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Display</label>
                        <label className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 cursor-pointer hover:bg-zinc-800 transition-colors">
                            <span className="text-sm text-zinc-200">Show Grid Overlay</span>
                            <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${settings.showGrid ? getBgClass() : 'bg-zinc-600'}`}>
                               <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.showGrid ? 'translate-x-5' : 'translate-x-0'}`}></div>
                               <input 
                                  type="checkbox" 
                                  checked={settings.showGrid}
                                  onChange={(e) => updateSettings({ showGrid: e.target.checked })}
                                  className="hidden"
                               />
                            </div>
                        </label>
                     </div>

                     {/* Export Format */}
                     <div className="space-y-3">
                        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Default Export Format</label>
                        <div className="grid grid-cols-2 gap-3">
                           <button 
                             onClick={() => updateSettings({ exportFormat: 'png' })}
                             className={`flex items-center justify-center p-3 rounded-lg border transition-all ${settings.exportFormat === 'png' ? `bg-${theme}-500/10 ${getBorderClass()} ${getTextClass()}` : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}
                           >
                              <span className="font-bold">PNG</span>
                              <span className="ml-2 text-xs opacity-70">High Quality</span>
                           </button>
                           <button 
                             onClick={() => updateSettings({ exportFormat: 'jpeg' })}
                             className={`flex items-center justify-center p-3 rounded-lg border transition-all ${settings.exportFormat === 'jpeg' ? `bg-${theme}-500/10 ${getBorderClass()} ${getTextClass()}` : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}
                           >
                              <span className="font-bold">JPEG</span>
                              <span className="ml-2 text-xs opacity-70">Small Size</span>
                           </button>
                        </div>
                     </div>

                     {/* Filename Prefix */}
                     <div className="space-y-3">
                         <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Default Filename Prefix</label>
                         <div className="relative">
                            <input 
                               type="text" 
                               value={settings.filenamePrefix}
                               onChange={(e) => updateSettings({ filenamePrefix: e.target.value })}
                               className={`w-full bg-zinc-800 border-zinc-700 rounded-lg p-3 text-sm text-white focus:ring-1 focus:ring-${theme}-500 focus:border-${theme}-500 outline-none`}
                               placeholder="e.g. photomini-edit"
                            />
                            <div className="absolute right-3 top-3.5 text-xs text-zinc-500 pointer-events-none">
                               {settings.filenamePrefix}-{new Date().getMinutes()}.{settings.exportFormat}
                            </div>
                         </div>
                     </div>
                   </>
                 ) : (
                    <div className="space-y-6">
                       <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                          <h4 className="flex items-center gap-2 font-bold text-white mb-2">
                             <ShieldCheck size={18} className="text-green-500" /> Independent Application
                          </h4>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                             Photomini is an independent project and is <strong>not affiliated with, endorsed by, or sponsored by Google</strong>. This application uses the Gemini API and MediaPipe technologies provided by Google for image processing.
                          </p>
                       </div>

                       <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                          <h4 className="flex items-center gap-2 font-bold text-white mb-2">
                             <Scale size={18} className="text-orange-500" /> User Responsibility
                          </h4>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                             You (the user) are solely responsible for the images you upload and the content you generate. By using this tool, you agree that you have the right to edit the images you upload and that you will not use this tool to generate illegal, harmful, or infringing content.
                          </p>
                       </div>

                       <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                          <h4 className="flex items-center gap-2 font-bold text-white mb-2">
                             <EyeOff size={18} className="text-blue-500" /> Privacy First
                          </h4>
                          <p className="text-sm text-zinc-400 leading-relaxed">
                             Photomini does not store your photos. Image processing happens either locally in your browser (Manual Tools, Face Detection) or is sent ephemerally to the API for AI editing and then discarded.
                          </p>
                       </div>
                    </div>
                 )}
              </div>
              
              <div className="p-4 bg-zinc-800/50 border-t border-zinc-700 flex justify-end shrink-0">
                 <Button onClick={() => setShowSettings(false)} className="w-full md:w-auto" themeColor={theme}>
                    <Save size={16} className="mr-2" /> Done
                 </Button>
              </div>
           </div>
        </div>
      )}


      {/* --- Main Workspace (Canvas) --- */}
      <div className="flex-1 flex flex-col h-screen relative order-2 md:order-1">
        {/* Top Header Mobile */}
        <div className="md:hidden h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#0f0f11] z-10">
          <span className={`font-bold ${getTextClass()} flex items-center gap-2`}>
            <Zap size={18} /> Photomini
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="text-zinc-400 hover:text-white p-2">
               <Settings size={20} />
            </button>
            {currentImage && (
               <button onClick={handleDownload} className="text-zinc-400 hover:text-white p-2">
                  <Download size={20} />
               </button>
            )}
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-[#09090b] overflow-hidden relative">
          
          {/* Pattern Background */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          </div>

          {!currentImage ? (
            <div className="text-center space-y-6 z-10 animate-in fade-in zoom-in duration-300">
              <div className="w-24 h-24 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700/50 shadow-xl">
                 <ImageIcon size={40} className="text-zinc-500" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Photomini</h2>
              <p className="text-zinc-500 max-w-sm mx-auto leading-relaxed">
                Upload a photo to start editing with standard tools or use the power of 
                <span className={`${getTextClass()} font-medium`}> Photomini AI</span>.
              </p>
              
              <div className="pt-4">
                 <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className={`shadow-lg shadow-${theme}-500/20`}
                  themeColor={theme}
                >
                  <Upload size={18} className="mr-2" /> Upload Photo
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative max-w-full max-h-full shadow-2xl rounded-sm overflow-hidden ring-1 ring-zinc-800 group">
               {isProcessing && (
                 <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <div className={`w-16 h-16 border-4 border-${theme}-500/30 border-t-${theme}-500 rounded-full animate-spin mb-4`}></div>
                    <p className={`${getTextClass()} font-medium animate-pulse`}>Photomini AI is thinking...</p>
                    <p className="text-zinc-500 text-sm mt-2">
                       Generating AI Edit...
                    </p>
                 </div>
               )}

               {/* Grid Overlay */}
               {settings.showGrid && (
                  <div className="absolute inset-0 pointer-events-none z-20 opacity-30">
                     <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                        <div className="border-r border-b border-white"></div>
                        <div className="border-r border-b border-white"></div>
                        <div className="border-b border-white"></div>
                        <div className="border-r border-b border-white"></div>
                        <div className="border-r border-b border-white"></div>
                        <div className="border-b border-white"></div>
                        <div className="border-r border-white"></div>
                        <div className="border-r border-white"></div>
                        <div></div>
                     </div>
                  </div>
               )}
               
               {activeTab === 'manual' ? (
                 <PaintCanvas 
                    ref={paintCanvasRef}
                    imageSrc={baseImage || ''}
                    restoreImageSrc={checkPointImage || baseImage || ''}
                    tool={manualTool}
                    settings={brushSettings}
                    filterStyle={getFilterStyle()}
                    onUpdate={handleManualUpdate}
                    className="max-w-full max-h-full"
                    faces={detectedFaces}
                 />
               ) : (
                 <img 
                   src={baseImage || ''} 
                   alt="Editing preview" 
                   className="max-w-full max-h-full object-contain block"
                   style={getFilterStyle()}
                 />
               )}
            </div>
          )}

          {error && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg flex items-center shadow-xl backdrop-blur-md max-w-md animate-in slide-in-from-bottom-5 z-50">
              <span className="mr-2">⚠️</span> {error}
              <button onClick={() => setError(null)} className="ml-4 hover:text-white">✕</button>
            </div>
          )}
        </div>
      </div>

      {/* --- Sidebar (Tools) --- */}
      <div className="w-full md:w-[360px] bg-[#0f0f11] border-l border-zinc-800 flex flex-col h-[45vh] md:h-full order-1 md:order-2 z-20 shadow-2xl">
        {/* Sidebar Header */}
        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#0f0f11] shrink-0">
           <div className="hidden md:flex font-bold text-xl text-white items-center gap-2">
             <span className={`w-2 h-8 ${getBgClass()} rounded-full`}></span>
             Tools
           </div>
           
           <div className="flex gap-2 ml-auto">
             <button onClick={() => setShowSettings(true)} title="Settings" className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                <Settings size={18} />
             </button>
             {currentImage && (
               <>
                 <div className="w-px h-6 bg-zinc-800 mx-1 self-center"></div>
                 <button onClick={handleDownload} title="Download" className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                    <Download size={18} />
                 </button>
                 <button onClick={handleReset} title="Reset Changes" className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                    <RefreshCcw size={18} />
                 </button>
                 <button onClick={handleClear} title="Close Image" className="p-2 hover:bg-red-500/20 rounded-full text-zinc-400 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                 </button>
               </>
             )}
           </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 shrink-0">
          <button 
            onClick={() => setActiveTab('adjust')}
            className={`flex-1 py-4 text-sm font-medium transition-colors relative ${activeTab === 'adjust' ? getTextClass() : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            <div className="flex items-center justify-center gap-2">
               <Sliders size={16} /> Adjust
            </div>
            {activeTab === 'adjust' && <div className={`absolute bottom-0 left-0 w-full h-0.5 ${getBgClass()}`}></div>}
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-4 text-sm font-medium transition-colors relative ${activeTab === 'manual' ? getTextClass() : 'text-zinc-400 hover:text-zinc-200'}`}
          >
             <div className="flex items-center justify-center gap-2">
               <Hand size={16} /> Draw
            </div>
            {activeTab === 'manual' && <div className={`absolute bottom-0 left-0 w-full h-0.5 ${getBgClass()}`}></div>}
          </button>
          <button 
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-4 text-sm font-medium transition-colors relative ${activeTab === 'ai' ? getTextClass() : 'text-zinc-400 hover:text-zinc-200'}`}
          >
             <div className="flex items-center justify-center gap-2">
               <Wand2 size={16} /> AI Edit
            </div>
            {activeTab === 'ai' && <div className={`absolute bottom-0 left-0 w-full h-0.5 ${getBgClass()}`}></div>}
          </button>
        </div>

        {/* Tool Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {!currentImage ? (
             <div className="h-full flex flex-col items-center justify-center text-zinc-500 opacity-50 space-y-4">
                <Sliders size={48} strokeWidth={1} />
                <p>No image selected</p>
             </div>
          ) : (
            <>
              {activeTab === 'adjust' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
                  <div className="space-y-1">
                     <h3 className="text-sm font-semibold text-white mb-4">Basic Adjustments</h3>
                     <Slider themeColor={theme} label="Brightness" value={filters.brightness} min={0} max={200} onChange={(v) => setFilters({...filters, brightness: v})} onReset={() => setFilters({...filters, brightness: 100})} />
                     <Slider themeColor={theme} label="Contrast" value={filters.contrast} min={0} max={200} onChange={(v) => setFilters({...filters, contrast: v})} onReset={() => setFilters({...filters, contrast: 100})} />
                     <Slider themeColor={theme} label="Saturation" value={filters.saturation} min={0} max={200} onChange={(v) => setFilters({...filters, saturation: v})} onReset={() => setFilters({...filters, saturation: 100})} />
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-800 space-y-1">
                     <h3 className="text-sm font-semibold text-white mb-4">Effects</h3>
                     <Slider themeColor={theme} label="Grayscale" value={filters.grayscale} min={0} max={100} onChange={(v) => setFilters({...filters, grayscale: v})} />
                     <Slider themeColor={theme} label="Sepia" value={filters.sepia} min={0} max={100} onChange={(v) => setFilters({...filters, sepia: v})} />
                     <Slider themeColor={theme} label="Blur" value={filters.blur} min={0} max={20} onChange={(v) => setFilters({...filters, blur: v})} />
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                     <h3 className="text-sm font-semibold text-white mb-4">Transform</h3>
                     <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setFilters({...filters, rotation: (filters.rotation + 90) % 360})} className="w-full" themeColor={theme}>
                           <RotateCw size={16} className="mr-2" /> Rotate 90°
                        </Button>
                     </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <Button onClick={handleDownload} className="w-full" themeColor={theme}>
                      <Download size={16} className="mr-2" /> Download Image
                    </Button>
                  </div>
                </div>
              )}

              {activeTab === 'manual' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
                    
                    {/* Face Privacy Section */}
                    <div className="p-4 bg-zinc-800/40 rounded-lg border border-zinc-800 space-y-3">
                       <h3 className={`text-xs font-bold ${getTextClass()} uppercase tracking-wider flex items-center gap-2`}>
                          <ScanFace size={14} /> Face Privacy
                       </h3>
                       {detectedFaces.length === 0 ? (
                         <Button 
                           onClick={handleDetectFaces} 
                           variant="secondary" 
                           className="w-full text-xs" 
                           isLoading={isDetectingFaces}
                           themeColor={theme}
                         >
                           Detect Faces
                         </Button>
                       ) : (
                         <div className="space-y-2 animate-in fade-in">
                            <div className="text-xs text-green-400 font-medium flex justify-between items-center">
                               <span>{detectedFaces.length} Face(s) detected</span>
                               <button onClick={() => setDetectedFaces([])} className="text-zinc-500 hover:text-white">Cancel</button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                               <button onClick={() => handleApplyFaceEffect('censor-eyes')} className={`flex flex-col items-center justify-center p-2 bg-zinc-800 rounded border border-zinc-700 hover:${getBorderClass()} hover:bg-${theme}-500/10 transition-all`}>
                                  <VenetianMask size={16} className="mb-1" />
                                  <span className="text-[10px]">Eyes</span>
                               </button>
                               <button onClick={() => handleApplyFaceEffect('pixelate-face')} className={`flex flex-col items-center justify-center p-2 bg-zinc-800 rounded border border-zinc-700 hover:${getBorderClass()} hover:bg-${theme}-500/10 transition-all`}>
                                  <Grid3X3 size={16} className="mb-1" />
                                  <span className="text-[10px]">Pixel</span>
                               </button>
                               <button onClick={() => handleApplyFaceEffect('blur-face')} className={`flex flex-col items-center justify-center p-2 bg-zinc-800 rounded border border-zinc-700 hover:${getBorderClass()} hover:bg-${theme}-500/10 transition-all`}>
                                  <UserX size={16} className="mb-1" />
                                  <span className="text-[10px]">Blur</span>
                               </button>
                            </div>
                         </div>
                       )}
                    </div>

                    <div className="pt-2 border-t border-zinc-800">
                        <h3 className="text-sm font-semibold text-white mb-4">Tools</h3>
                        <div className="grid grid-cols-5 gap-2">
                           {[
                             { id: 'brush', icon: Paintbrush, label: 'Brush' },
                             { id: 'blur', icon: Droplets, label: 'Blur' },
                             { id: 'pixelate', icon: Grid3X3, label: 'Pixel' },
                             { id: 'censor', icon: EyeOff, label: 'Censor' },
                             { id: 'lighten', icon: Sun, label: 'Lighten' },
                             { id: 'darken', icon: Moon, label: 'Darken' },
                             { id: 'tint', icon: Palette, label: 'Tint' },
                             { id: 'desaturate', icon: Ghost, label: 'B&W' },
                             { id: 'invert', icon: ArrowLeftRight, label: 'Invert' },
                             { id: 'eraser', icon: Eraser, label: 'Restore' }
                           ].map((tool) => (
                             <button
                               key={tool.id}
                               onClick={() => setManualTool(tool.id as ManualToolType)}
                               className={`flex flex-col items-center justify-center p-3 rounded-lg transition-all ${
                                 manualTool === tool.id 
                                   ? `${getBgClass()} text-black shadow-lg shadow-${theme}-500/20` 
                                   : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                               }`}
                             >
                                <tool.icon size={20} />
                                <span className="text-[10px] font-medium mt-1">{tool.label}</span>
                             </button>
                           ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800 space-y-4">
                        <h3 className="text-sm font-semibold text-white">Settings</h3>
                        
                        {/* Size Slider (All Tools) */}
                        <Slider 
                           themeColor={theme}
                           label={manualTool === 'censor' ? "Bar Width" : "Brush Size"}
                           value={brushSettings.size} 
                           min={1} 
                           max={100} 
                           onChange={(v) => setBrushSettings({...brushSettings, size: v})} 
                        />

                        {/* Intensity Slider (Blur/Pixelate) */}
                        {(manualTool === 'blur' || manualTool === 'pixelate') && (
                          <Slider 
                             themeColor={theme}
                             label={manualTool === 'blur' ? "Strength" : "Pixel Size"}
                             value={brushSettings.intensity} 
                             min={1} 
                             max={50} 
                             onChange={(v) => setBrushSettings({...brushSettings, intensity: v})} 
                          />
                        )}

                        {/* Color Picker (Brush only) */}
                        {(manualTool === 'brush' || manualTool === 'tint') && (
                           <div className="space-y-2">
                              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Color</label>
                              <div className="flex gap-2 flex-wrap">
                                 {['#ffffff', '#000000', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6'].map(color => (
                                    <button
                                       key={color}
                                       onClick={() => setBrushSettings({...brushSettings, color})}
                                       className={`w-8 h-8 rounded-full border-2 ${brushSettings.color === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'} transition-transform`}
                                       style={{ backgroundColor: color }}
                                    />
                                 ))}
                                 <input 
                                    type="color" 
                                    value={brushSettings.color}
                                    onChange={(e) => setBrushSettings({...brushSettings, color: e.target.value})}
                                    className="w-8 h-8 rounded-full bg-transparent overflow-hidden cursor-pointer"
                                 />
                              </div>
                           </div>
                        )}
                    </div>

                    <div className="pt-4 text-xs text-zinc-500 flex items-start gap-2 bg-zinc-800/50 p-3 rounded-lg border border-zinc-800">
                        <Info size={14} className="mt-0.5 shrink-0" />
                        <p>Changes in Manual mode are applied instantly. Use "Reset" in the top bar to undo all edits.</p>
                    </div>
                 </div>
              )}

              {activeTab === 'ai' && (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
                    
                    <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400 border border-zinc-700/50">
                       <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-zinc-300">Usage Limits</span>
                          <span className="bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded text-[10px]">FREE</span>
                       </div>
                       
                       {/* Daily Usage Tracker */}
                       <div className="mb-3 p-2 bg-zinc-800 rounded border border-zinc-700">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] uppercase text-zinc-400 font-bold flex items-center gap-1">
                              <BarChart3 size={10} /> Daily Usage
                            </span>
                            <span className={`text-[10px] font-mono ${dailyUsage >= DAILY_LIMIT ? 'text-red-500' : getTextClass()}`}>
                              {dailyUsage} / {DAILY_LIMIT}
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${Math.min((dailyUsage / DAILY_LIMIT) * 100, 100)}%` }} 
                              className={`h-full transition-all duration-500 ${dailyUsage >= DAILY_LIMIT ? 'bg-red-500' : getBgClass()}`}
                            ></div>
                          </div>
                       </div>

                       <ul className="space-y-1.5">
                         <li className="flex justify-between">
                           <span>Daily Quota:</span>
                           <span className="text-zinc-300">250 Requests</span>
                         </li>
                         <li className="flex justify-between">
                            <span>Rate Limit:</span>
                            <span className="text-zinc-300">15 Req / min</span>
                         </li>
                         <li className="flex justify-between border-t border-zinc-700/50 pt-1.5 mt-1.5">
                            <span>Cost per Edit:</span>
                            <span className={`${getTextClass()} font-mono`}>1 Request</span>
                         </li>
                          <li className="flex justify-between">
                            <span>Token Cost:</span>
                            <span className="text-zinc-300 font-mono">~{estimatedTokens} Tokens</span>
                         </li>
                       </ul>
                       <div className={`mt-3 p-2 bg-${theme}-500/5 rounded border border-${theme}-500/10 text-[10px] text-zinc-400 leading-relaxed flex gap-2`}>
                          <Info size={14} className={`${getTextClass()} shrink-0 mt-0.5`} />
                          <div>
                            <span className={`${getTextClass()} font-medium`}>Why fixed cost?</span> Photomini AI "sees" images by converting them into a fixed package of <strong>258 tokens</strong>, regardless of resolution.
                          </div>
                       </div>
                    </div>

                    <div>
                       <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                          AI Prompt
                       </label>
                       <textarea 
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="Describe how to change the image (e.g., 'Make it look like a cyberpunk city', 'Add snow', 'Turn into a sketch')"
                          className={`w-full bg-zinc-800 border-zinc-700 rounded-lg p-3 text-sm text-white placeholder-zinc-500 focus:ring-1 focus:ring-${theme}-500 focus:border-${theme}-500 min-h-[100px] resize-none`}
                       />
                       <div className="flex justify-between mt-1 text-[10px] text-zinc-500 px-1">
                          <span>Be descriptive for better results</span>
                       </div>
                    </div>
                    
                    <Button 
                      onClick={handleAiEdit}
                      isLoading={isProcessing}
                      disabled={!aiPrompt.trim() || isProcessing}
                      className="w-full"
                      themeColor={theme}
                    >
                      <Wand2 size={16} className="mr-2" /> Generate Edit
                    </Button>
                 </div>
              )}
            </>
          )}
        </div>
        
        {/* Sidebar Footer Credit */}
        <div className="p-3 border-t border-zinc-800 text-center text-[10px] text-zinc-600 font-mono tracking-wider hover:text-zinc-500 transition-colors cursor-default">
           &gt;&gt;&gt; DEVELOPED BY EIMITHUT &lt;&lt;&lt;
        </div>
      </div>
    </div>
    </>
  );
}