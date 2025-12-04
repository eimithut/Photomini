import React from 'react';

export type ThemeColor = 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'pink' | 'orange' | 'cyan';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  icon?: React.ReactNode;
  themeColor?: ThemeColor;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  icon,
  className = '',
  themeColor = 'yellow',
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#18181b]";
  
  // Dynamic color classes based on theme
  const colorClasses: Record<ThemeColor, string> = {
    yellow: "bg-yellow-500 hover:bg-yellow-400 focus:ring-yellow-500",
    blue: "bg-blue-500 hover:bg-blue-400 focus:ring-blue-500",
    green: "bg-green-500 hover:bg-green-400 focus:ring-green-500",
    red: "bg-red-500 hover:bg-red-400 focus:ring-red-500",
    purple: "bg-purple-500 hover:bg-purple-400 focus:ring-purple-500",
    pink: "bg-pink-500 hover:bg-pink-400 focus:ring-pink-500",
    orange: "bg-orange-500 hover:bg-orange-400 focus:ring-orange-500",
    cyan: "bg-cyan-500 hover:bg-cyan-400 focus:ring-cyan-500",
  };

  const variants = {
    primary: `${colorClasses[themeColor]} text-black`,
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 focus:ring-zinc-600",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : icon ? (
        <span className="mr-2">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};