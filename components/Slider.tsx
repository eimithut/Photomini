import React from 'react';
import { ThemeColor } from './Button';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  themeColor?: ThemeColor;
}

export const Slider: React.FC<SliderProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step = 1, 
  onChange, 
  onReset,
  themeColor = 'yellow' 
}) => {
  
  const hoverTextColors: Record<ThemeColor, string> = {
    yellow: "hover:text-yellow-500",
    blue: "hover:text-blue-500",
    green: "hover:text-green-500",
    red: "hover:text-red-500",
    purple: "hover:text-purple-500",
    pink: "hover:text-pink-500",
    orange: "hover:text-orange-500",
    cyan: "hover:text-cyan-500",
  };

  const accentColors: Record<ThemeColor, string> = {
    yellow: "accent-yellow-500 hover:accent-yellow-400",
    blue: "accent-blue-500 hover:accent-blue-400",
    green: "accent-green-500 hover:accent-green-400",
    red: "accent-red-500 hover:accent-red-400",
    purple: "accent-purple-500 hover:accent-purple-400",
    pink: "accent-pink-500 hover:accent-pink-400",
    orange: "accent-orange-500 hover:accent-orange-400",
    cyan: "accent-cyan-500 hover:accent-cyan-400",
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</label>
        <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">{value}</span>
            {onReset && (
                <button 
                  onClick={onReset} 
                  className={`text-[10px] text-zinc-600 ${hoverTextColors[themeColor]} transition-colors`}
                >
                    RESET
                </button>
            )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer ${accentColors[themeColor]}`}
      />
    </div>
  );
};