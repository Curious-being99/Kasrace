import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Copy, Check, ExternalLink, ShieldCheck, RefreshCw, Key, Network, QrCode, Settings, ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import {
  KaspaWalletState,
  connectKaswareWallet,
  createRealKaspaDepositWallet,
  importKaspaWalletFromSeed,
  fetchKaspaBalance,
  KASPA_MAINNET_API,
  KASPA_NODE_GRPC,
} from '../services/kaspaMainnet';

interface KaspaWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletState: KaspaWalletState;
  onWalletUpdate: (newState: KaspaWalletState) => void;
  kaspaPrice?: number;
}

export const KaspaWalletModal: React.FC<KaspaWalletModalProps> = ({
  isOpen,
  onClose,
  walletState,
  onWalletUpdate,
  kaspaPrice = 0.125
}) => {
  const [activeTab, setActiveTab] = useState<'kasware' | 'deposit' | 'import'>('kasware');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSeed, setCreatedSeed] = useState<string | null>(null);
  const [importSeedInput, setImportSeedInput] = useState<string>('');
  const [seedCopied, setSeedCopied] = useState<boolean>(false);
  const [isSeedHidden, setIsSeedHidden] = useState<boolean>(true);
  const [isSeedDropdownOpen, setIsSeedDropdownOpen] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  useEffect(() => {
    if (walletState.isConnected && walletState.seedPhrase) {
      setCreatedSeed(walletState.seedPhrase);
    } else {
      setCreatedSeed(null);
    }
  }, [walletState.isConnected, walletState.seedPhrase]);


  if (!isOpen) return null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySeed = (seedText: string) => {
    navigator.clipboard.writeText(seedText);
    setSeedCopied(true);
    setTimeout(() => setSeedCopied(false), 2500);
  };

  const handleConnectKasware = async () => {
    setLoading(true);
    setError(null);
    const res = await connectKaswareWallet();
    setLoading(false);

    if (res.success && res.address) {
      onWalletUpdate({
        address: res.address,
        balanceKas: res.balanceKas || 0,
        isConnected: true,
        walletType: 'kasware',
      });
      onClose();
    } else {
      setError(res.error || 'Could not connect to Kasware Wallet extension');
    }
  };

  const handleCreateDepositWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const newWallet = await createRealKaspaDepositWallet();
      setCreatedSeed(newWallet.seedPhrase);
      setIsSeedHidden(true);
      setSeedCopied(false);
      
      // Fetch initial balance from Kaspa REST API
      const balanceInfo = await fetchKaspaBalance(newWallet.address);

      onWalletUpdate({
        address: newWallet.address,
        balanceKas: balanceInfo.balanceKas || 0,
        isConnected: true,
        walletType: 'native',
        seedPhrase: newWallet.seedPhrase,
      });
    } catch (err: any) {
      setError('Error generating: ' + (err.message || err)); // console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSeedWallet = async () => {
    if (!importSeedInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const imported = await importKaspaWalletFromSeed(importSeedInput);
      setCreatedSeed(imported.seedPhrase);
      setIsSeedHidden(true);
      setSeedCopied(false);

      // Fetch initial balance from Kaspa REST API
      const balanceInfo = await fetchKaspaBalance(imported.address);

      onWalletUpdate({
        address: imported.address,
        balanceKas: balanceInfo.balanceKas || 0,
        isConnected: true,
        walletType: 'native',
        seedPhrase: imported.seedPhrase,
      });
    } catch (err: any) {
      setError('Error importing: ' + (err.message || err));
      // console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshBalance = async () => {
    if (!walletState.address) return;
    setRefreshing(true);
    try {
      const balanceInfo = await fetchKaspaBalance(walletState.address);
      const newBal = balanceInfo.balanceKas;
      const oldBal = walletState.balanceKas;
      
      let newPending = walletState.pendingDeduction || 0;
      if (newBal < oldBal) {
        const drop = oldBal - newBal;
        newPending = Math.max(0, newPending - drop);
      }

      onWalletUpdate({
        ...walletState,
        balanceKas: newBal,
        pendingDeduction: newPending,
      });
    } catch (e) {
      // console.warn('Balance refresh warning:', e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-[#70C7BA]/40 rounded-2xl p-3.5 sm:p-5 max-w-md w-full shadow-[0_0_30px_rgba(112,199,186,0.15)] relative text-left font-sans max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] sm:text-xs font-bold transition-colors cursor-pointer z-10"
          >
            CLOSE ✕
          </button>

          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-[#70C7BA]/20 text-[#70C7BA] rounded-xl border border-[#70C7BA]/40 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-racing font-bold text-white tracking-wider flex items-center gap-1.5">
                <span className="text-[#70C7BA]">KASPA WALLET</span>
              </h2>
            </div>
          </div>

          {/* Connected Wallet Section */}
          {walletState.isConnected ? (
            <div className="bg-slate-950/90 border border-[#70C7BA]/50 rounded-xl p-2.5 sm:p-3 mb-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-mono font-bold text-[#70C7BA] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#70C7BA] animate-pulse" />
                  CONNECTED ({walletState.walletType === 'native' ? 'BUILT-IN WALLET' : walletState.walletType.toUpperCase()})
                </span>
                <span className="text-[10px] font-mono text-[#70C7BA]/85">LIVE</span>
              </div>

              {/* Deposit QR Code & Address Display */}
              <div className="bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                  {/* Real Deposit QR Code */}
                  <div className="bg-white p-1 rounded-lg shrink-0 shadow-sm">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(walletState.address)}`}
                      alt="Kaspa Deposit QR Code"
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-[9px] text-[#70C7BA] font-mono font-bold flex items-center gap-1">
                      <QrCode className="w-2.5 h-2.5" /> DEPOSIT ADDRESS
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-mono font-bold text-white select-all break-all bg-slate-950 p-1.5 rounded-lg border border-slate-800 leading-tight">
                      {walletState.address}
                    </div>
                    <button
                      onClick={() => handleCopy(walletState.address)}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[#70C7BA] text-[10px] font-mono rounded transition-colors cursor-pointer flex items-center gap-1 font-bold"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'COPIED' : 'COPY'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* On-Chain Balance & Refresh */}
              <div className="bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[9px] text-slate-400 font-mono">LIVE BALANCE</div>
                  <div className="text-base font-mono font-black text-[#70C7BA]">
                    {(walletState.balanceKas - (walletState.pendingDeduction || 0)).toFixed(4)} KAS
                    <span className="ml-2 text-xs text-slate-400 font-bold">
                      ≈ ${((walletState.balanceKas - (walletState.pendingDeduction || 0)) * kaspaPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                  {walletState.pendingDeduction && walletState.pendingDeduction > 0 && (
                    <div className="text-[8px] text-emerald-400 font-mono">
                      -{walletState.pendingDeduction.toFixed(2)} KAS PENDING CONFIRMATION
                    </div>
                  )}
                </div>
                <button
                  onClick={handleRefreshBalance}
                  disabled={refreshing}
                  className="px-2.5 py-1 bg-[#70C7BA]/20 hover:bg-[#70C7BA]/30 text-[#70C7BA] border border-[#70C7BA]/40 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>REFRESH</span>
                </button>
              </div>

              {/* Seed phrase display drop box if newly created deposit wallet */}
              {createdSeed && (
                <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-2.5 text-xs space-y-1.5">
                  {/* Drop box Accordion Header */}
                  <button
                    type="button"
                    onClick={() => setIsSeedDropdownOpen(!isSeedDropdownOpen)}
                    className="flex items-center justify-between text-red-400 font-bold font-mono w-full cursor-pointer hover:text-red-300 transition-colors"
                  >
                    <span className="flex items-center gap-1 text-[11px] font-extrabold tracking-wider">
                      <Key className="w-3.5 h-3.5 text-red-500" /> 
                      <span>SEED PHRASE & RECOVERY</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 font-mono">12 WORDS</span>
                      {isSeedDropdownOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {/* Drop box Content */}
                  {isSeedDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 pt-1"
                    >
                      {/* Seed Box with Red Text */}
                      <div className="font-mono select-all break-words bg-slate-950 p-2 rounded-lg border border-red-900/60 text-[10px] text-center tracking-wide">
                        {isSeedHidden ? (
                          <span className="text-slate-500 tracking-widest font-bold">•••• •••• •••• •••• •••• ••••</span>
                        ) : (
                          <span className="text-red-500 font-black tracking-wide break-words">{createdSeed}</span>
                        )}
                      </div>

                      {/* Native Action Buttons */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsSeedHidden(!isSeedHidden)}
                          className="py-1 px-2 bg-slate-900 hover:bg-slate-800 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          {isSeedHidden ? <Unlock className="w-3 h-3 text-[#70C7BA]" /> : <Lock className="w-3 h-3 text-red-400" />}
                          <span>{isSeedHidden ? 'UNLOCK' : 'LOCK SEED'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopySeed(createdSeed)}
                          className="py-1 px-2 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          {seedCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-red-300" />}
                          <span>{seedCopied ? 'COPIED ✓' : 'COPY SEED'}</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  setCreatedSeed(null);
                  onWalletUpdate({
                    address: '',
                    balanceKas: 0,
                    isConnected: false,
                    walletType: 'none',
                  });
                }}
                className="w-full mt-1.5 py-2 bg-rose-950/40 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                DISCONNECT WALLET
              </button>
            </div>
          ) : (
            <>
              {/* Connection Type Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 mb-3">
                <button
                  onClick={() => setActiveTab('kasware')}
                  className={`py-1.5 text-[9px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer font-mono ${
                    activeTab === 'kasware'
                      ? 'bg-[#70C7BA] text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  KASWARE
                </button>
                <button
                  onClick={() => setActiveTab('deposit')}
                  className={`py-1.5 text-[9px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer font-mono ${
                    activeTab === 'deposit'
                      ? 'bg-[#70C7BA] text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  CREATE WALLET
                </button>
                <button
                  onClick={() => setActiveTab('import')}
                  className={`py-1.5 text-[9px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer font-mono ${
                    activeTab === 'import'
                      ? 'bg-[#70C7BA] text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  IMPORT SEED
                </button>
              </div>

              {error && (
                <div className="bg-rose-950/80 border border-rose-800 text-rose-300 p-2 rounded-xl text-xs font-medium mb-3">
                  {error}
                </div>
              )}

              {/* Option 1: Kasware Browser Extension */}
              {activeTab === 'kasware' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Connect your Kasware extension wallet for instant on-chain transaction signing and race entry fee deductions.
                  </p>
                  <button
                    onClick={handleConnectKasware}
                    disabled={loading}
                    className="w-full py-2.5 bg-[#70C7BA] hover:bg-[#5eb3a6] text-slate-950 font-racing font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 border border-[#70C7BA]/50"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>CONNECT KASWARE WALLET</span>
                  </button>
                  <p className="text-[10px] text-slate-400 pt-1 font-mono">
                    Kasware Browser Extension required for extension wallet mode
                  </p>
                </div>
              )}

              {/* Option 2: Create Real Kaspa Deposit Wallet */}
              {activeTab === 'deposit' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Generate a dedicated deposit address (`kaspa:q...`) to receive KAS from any mobile wallet or exchange to use for race entry fees.
                  </p>
                  <button
                    onClick={handleCreateDepositWallet}
                    disabled={loading}
                    className="w-full py-2.5 bg-[#70C7BA] hover:bg-[#5eb3a6] text-slate-950 font-racing font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                    <span>CREATE DEPOSIT WALLET</span>
                  </button>
                </div>
              )}

              {/* Option 3: Import Seed Phrase */}
              {activeTab === 'import' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Import an existing 12-word seed phrase to restore your wallet. This will re-derive your deposit address and scan for incoming transactions.
                  </p>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                      Enter 12-Word Seed Phrase
                    </label>
                    <textarea
                      rows={2}
                      value={importSeedInput}
                      onChange={(e) => setImportSeedInput(e.target.value)}
                      placeholder="word1 word2 word3 ..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-[#70C7BA] rounded-xl p-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    onClick={handleImportSeedWallet}
                    disabled={loading || !importSeedInput.trim()}
                    className="w-full py-2.5 bg-[#70C7BA] hover:bg-[#5eb3a6] text-slate-950 font-racing font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    <span>IMPORT WALLET</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Connection Settings Info Panel */}
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-300">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-1.5 text-[#70C7BA] hover:text-white transition-colors cursor-pointer group"
              >
                <Settings className="w-3 h-3 group-hover:rotate-45 transition-transform" />
                <span>CONNECTION SETTINGS</span>
                {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span className="text-[10px] text-red-500 font-bold font-mono">
                MAINNET
              </span>
            </div>

            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-slate-950/90 rounded-xl p-2.5 border border-slate-800 space-y-1.5 text-[10px] font-mono"
              >
                <div>
                  <div className="text-slate-400 text-[9px] font-semibold">KASPA gRPC NODE</div>
                  <div className="text-[#70C7BA] font-bold truncate">{KASPA_NODE_GRPC}</div>
                </div>

                <div className="pt-1 border-t border-slate-900">
                  <div className="text-slate-400 text-[9px] font-semibold">KASPA EXPLORER API</div>
                  <div className="text-[#70C7BA] font-bold truncate">{KASPA_MAINNET_API}</div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};


