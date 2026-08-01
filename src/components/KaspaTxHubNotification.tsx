import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy, X, Zap, ArrowUpRight } from 'lucide-react';

export interface KaspaTxNotificationData {
  id: string;
  txHash: string;
  amountKas: number;
  explorerUrl: string;
  timestamp: number;
  label?: string; // Optional label for item name or action
  blueScore?: number;
  isIncoming?: boolean;
  status?: 'PENDING' | 'CONFIRMED';
}

interface KaspaTxHubNotificationProps {
  notification: KaspaTxNotificationData | null;
  onDismiss: () => void;
}

export const KaspaTxHubNotification: React.FC<KaspaTxHubNotificationProps> = ({
  notification,
  onDismiss,
}) => {
  const [copied, setCopied] = useState(false);

  if (!notification) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(notification.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isIncoming = !!notification.isIncoming;
  const isConfirmed = notification.status === 'CONFIRMED';
  const accentColor = isIncoming ? '#10b981' : (isConfirmed ? '#10b981' : '#70C7BA');
  const accentShadow = isIncoming ? 'rgba(16,185,129,0.25)' : (isConfirmed ? 'rgba(16,185,129,0.25)' : 'rgba(112,199,186,0.25)');

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        className="fixed top-2 right-2 sm:top-4 sm:right-4 z-50 max-w-[200px] w-full bg-slate-900/95 border rounded-lg p-1.5 shadow-lg backdrop-blur-md text-left text-white font-sans"
        style={{
          borderColor: accentColor,
          boxShadow: `0 0 15px ${accentShadow}`
        }}
      >
        <div className="flex items-center justify-between gap-1 border-b pb-1 mb-1" style={{ borderColor: `${accentColor}20` }}>
          <div className="flex items-center gap-1 min-w-0">
            <div className="p-0.5 rounded shrink-0" style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}30` }}>
              {isConfirmed ? <Check className="w-2.5 h-2.5" /> : <Zap className="w-2.5 h-2.5" />}
            </div>
            <div className="truncate">
              <div className="text-[7.5px] font-racing font-extrabold tracking-wide flex items-center gap-1 truncate" style={{ color: accentColor }}>
                <span>{notification.label ? notification.label.toUpperCase() : (isConfirmed ? 'TX CONFIRMED' : (isIncoming ? 'DEPOSIT DETECTED' : 'TX PENDING'))}</span>
                {!isConfirmed && <span className="w-1 h-1 rounded-full animate-ping shrink-0" style={{ backgroundColor: accentColor }} />}
              </div>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between bg-slate-950 p-1 rounded border border-slate-800/80">
            <span className="text-[8px] font-mono text-slate-400 font-semibold">{isIncoming ? 'Received:' : 'Network Fee:'}</span>
            <span className={`text-[9px] font-mono font-black ${isIncoming ? 'text-emerald-400' : (isConfirmed ? 'text-emerald-400' : 'text-rose-400')}`}>
              {isIncoming ? '+' : '-'}{notification.amountKas < 0.01 ? notification.amountKas.toFixed(4) : notification.amountKas.toFixed(2)} KAS
            </span>
          </div>

          <div className="bg-slate-950/80 p-1 rounded border border-slate-800/80 space-y-0.5">
            <div className="flex items-center justify-between text-[7px] font-mono text-slate-400">
              <span>STATUS</span>
              <span className={`font-bold ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isConfirmed ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[7px] font-mono text-slate-400">
              <span>TX HASH</span>
              <button
                onClick={handleCopy}
                className="hover:opacity-85 flex items-center gap-0.5 font-bold cursor-pointer"
                style={{ color: accentColor }}
              >
                {copied ? <Check className="w-2 h-2 text-emerald-400" /> : <Copy className="w-1.5 h-1.5" />}
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>
            {notification.explorerUrl ? (
              <a 
                href={notification.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[7.5px] font-mono text-slate-300 truncate hover:text-white hover:underline block cursor-pointer"
              >
                {notification.txHash}
              </a>
            ) : (
              <div className="text-[7.5px] font-mono text-slate-300 truncate select-all">
                {notification.txHash}
              </div>
            )}
          </div>

          {notification.explorerUrl && (
            <a
              href={notification.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-1 py-1 text-slate-950 font-racing font-bold text-[9px] rounded-md transition-all flex items-center justify-center gap-1 border cursor-pointer"
              style={{
                backgroundColor: accentColor,
                borderColor: `${accentColor}40`
              }}
            >
              <span>VIEW ON EXPLORER</span>
              <ArrowUpRight className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};


