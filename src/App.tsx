/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import GameEngine from './components/GameEngine';
import { socket } from './services/socket';
import { Player, CarConfig } from './types';
import { Flag, Users, Copy, Check, Smartphone, Monitor, Wrench, Coins, Sparkles, Cpu, Wallet, Zap, RotateCcw, Download, X, ExternalLink, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BackgroundRacingScene from './components/4d/BackgroundRacingScene';
import { CAR_CATALOGUE } from './data/cars';
import GarageView from './components/GarageView';
import { fetchKaspaPrice, isValidKaspaAddress, fetchKaspaBalance, fetchKaspaMainnetInfo, KaspaWalletState, executeKaspaRaceEntry, executeKaspaItemPurchase } from './services/kaspaMainnet';
import { KaspaWalletModal } from './components/KaspaWalletModal';
import { KaspaTxHubNotification, KaspaTxNotificationData } from './components/KaspaTxHubNotification';

const AdvancedGarageButton = ({ onClick, carConfig }: { onClick: () => void; carConfig: any }) => {
  const activeCarId = carConfig?.selectedCarId || 'viper';
  const activeCar = CAR_CATALOGUE.find(c => c.id === activeCarId) || CAR_CATALOGUE[0];

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 p-3 sm:p-4 rounded-xl shadow-xl transition-all cursor-pointer flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 select-none z-20 active:translate-y-0.5"
    >
      {/* Car Info & Balance Section */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-lg shrink-0 border border-amber-500/20">
          <Wrench className="w-5 h-5" />
        </div>
        <div className="text-left min-w-0">
          <div className="text-xs sm:text-sm font-racing font-bold tracking-wider text-slate-100 flex items-center gap-1.5">
            <span>SELECTED RIDE:</span>
            <span className="text-amber-400 truncate">{activeCar.name}</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium truncate">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/30" style={{ backgroundColor: carConfig?.color || activeCar.color }} />
            <span className="text-slate-300 font-semibold">{activeCar.category}</span>
          </div>
        </div>
      </div>

      {/* Switch Cars Action Tag */}
      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
        <div className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 rounded-lg text-xs font-racing font-bold tracking-wider transition-colors shadow-md">
          <Sparkles className="w-3.5 h-3.5" />
          <span>SWITCH CAR</span>
        </div>
      </div>
    </motion.button>
  );
};

export default function App() {
  const [view, setView] = useState<'landing' | 'lobby' | 'game'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [publicRooms, setPublicRooms] = useState<Array<{ id: string; racersCount: number; hostName: string; hostColor: string }>>([]);
  const [kaspaPrice, setKaspaPrice] = useState<number>(0.125);
  const [kaspaBlueScore, setKaspaBlueScore] = useState<number>(104825000);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [txNotification, setTxNotification] = useState<KaspaTxNotificationData | null>(null);
  const [walletState, setWalletState] = useState<KaspaWalletState>(() => {
    const saved = localStorage.getItem('kaspa_wallet_state');
    return saved ? JSON.parse(saved) : { address: '', balanceKas: 0, isConnected: false, walletType: 'none' };
  });

  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  const toggleBgMusic = () => {
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio(window.location.origin + '/racing_music.mp3');
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = 0.4;
      
      bgMusicRef.current.addEventListener('error', () => {
        if (bgMusicRef.current) {
          const currentSrc = bgMusicRef.current.src;
          if (currentSrc.includes('/racing_music.mp3')) {
            console.log('App bgMusic fallback to /new_racing_music.mp3');
            bgMusicRef.current.src = window.location.origin + '/new_racing_music.mp3';
            bgMusicRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false));
          } else if (currentSrc.includes('/new_racing_music.mp3')) {
            console.log('App bgMusic fallback to /api/music');
            bgMusicRef.current.src = window.location.origin + '/api/music';
            bgMusicRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false));
          }
        }
      });
    }
    if (isMusicPlaying) {
      bgMusicRef.current.pause();
      setIsMusicPlaying(false);
      console.log('Music paused');
    } else {
      bgMusicRef.current.play().then(() => {
        setIsMusicPlaying(true);
        console.log('Music playing');
      }).catch(err => {
        console.warn('Audio playback failed, trying fallback:', err);
        // Force trigger fallback if not already trying
        if (bgMusicRef.current) {
          const currentSrc = bgMusicRef.current.src;
          if (currentSrc.includes('/racing_music.mp3')) {
            bgMusicRef.current.src = window.location.origin + '/new_racing_music.mp3';
            bgMusicRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false));
          } else if (currentSrc.includes('/new_racing_music.mp3')) {
            bgMusicRef.current.src = window.location.origin + '/api/music';
            bgMusicRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false));
          }
        }
      });
    }
  };

  const handleWalletUpdate = (newState: KaspaWalletState) => {
    setWalletState(newState);
    localStorage.setItem('kaspa_wallet_state', JSON.stringify(newState));
  };

  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const walletStateRef = useRef(walletState);
  walletStateRef.current = walletState;

  const kaspaBlueScoreRef = useRef(kaspaBlueScore);
  kaspaBlueScoreRef.current = kaspaBlueScore;

  const [isLandscape, setIsLandscape] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [appLoadingProgress, setAppLoadingProgress] = useState(0);
  const [appLoadingStage, setAppLoadingStage] = useState('Initializing GameEngine.tsx WebGL Runtime...');

  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.innerWidth > window.innerHeight;
      setIsLandscape(landscape);
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Landscape Loading Screen progress sequence (triggers when in landscape mode)
  useEffect(() => {
    if (isLandscape && isAppLoading) {
      setAppLoadingProgress(0);

      const stages = [
        { target: 20, msg: 'Initializing GameEngine.tsx WebGL 3D Canvas & Shaders...' },
        { target: 45, msg: 'Loading 3D Track Geometries & Collision Physics Engine...' },
        { target: 70, msg: 'Synchronizing Kaspa Mainnet ZK Proof Verifier & BlueScore...' },
        { target: 90, msg: 'Calibrating Engine Audio Synthesizer & P2P Telemetry...' },
        { target: 100, msg: 'GameEngine.tsx System Checks Complete! Launching...' }
      ];

      let current = 0;
      const interval = setInterval(() => {
        current += Math.floor(Math.random() * 8) + 4;
        if (current >= 100) {
          current = 100;
          clearInterval(interval);
        }
        setAppLoadingProgress(current);

        if (current < 25) {
          setAppLoadingStage(stages[0].msg);
        } else if (current < 50) {
          setAppLoadingStage(stages[1].msg);
        } else if (current < 75) {
          setAppLoadingStage(stages[2].msg);
        } else if (current < 95) {
          setAppLoadingStage(stages[3].msg);
        } else {
          setAppLoadingStage(stages[4].msg);
        }
      }, 40);

      return () => clearInterval(interval);
    }
  }, [isLandscape]);

  useEffect(() => {
    if (appLoadingProgress === 100 && isAppLoading) {
      const timer = setTimeout(() => {
        setIsAppLoading(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [appLoadingProgress, isAppLoading]);

  // Background Kaspa Address scanning for available balance and incoming transactions
  useEffect(() => {
    if (!walletState.isConnected || !walletState.address) return;

    const interval = setInterval(async () => {
      try {
        const balanceInfo = await fetchKaspaBalance(walletState.address);
        if (balanceInfo.isValid) {
          const newBal = balanceInfo.balanceKas;
          const oldBal = walletState.balanceKas;

          if (newBal !== oldBal) {
            // Check if the drop matches our pending deduction (confirmation logic)
            let newPending = walletState.pendingDeduction || 0;
            if (newBal < oldBal) {
              const drop = oldBal - newBal;
              newPending = Math.max(0, newPending - drop);

              // Update notification status to confirmed if it was pending
              setTxNotification(prev => {
                if (prev && !prev.isIncoming && prev.status !== 'CONFIRMED') {
                  return {
                    ...prev,
                    status: 'CONFIRMED'
                  };
                }
                return prev;
              });
            }

            // Update balance while preserving or updating local pending state
            const updated: KaspaWalletState = {
              ...walletState,
              balanceKas: newBal,
              pendingDeduction: newPending,
            };
            setWalletState(updated);
            localStorage.setItem('kaspa_wallet_state', JSON.stringify(updated));

            // If funds increased, trigger incoming transaction notification
            if (newBal > oldBal) {
              const receivedAmount = newBal - oldBal;
              setTxNotification({
                id: `incoming-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                txHash: `scan-recv-${Math.random().toString(36).substring(2, 10)}`,
                amountKas: receivedAmount,
                explorerUrl: `https://explorer.kaspa.org/addresses/${walletState.address}`,
                timestamp: Date.now(),
                blueScore: kaspaBlueScore,
                isIncoming: true,
                status: 'CONFIRMED',
              });
            }
          }
        }
      } catch (err) {
        // console.warn('Background Kaspa scan error:', err);
      }
    }, 5000); // Scan every 5 seconds

    return () => clearInterval(interval);
  }, [walletState.isConnected, walletState.address, walletState.balanceKas, walletState.pendingDeduction, kaspaBlueScore]);

  // Auto-confirm real transactions after a longer period visually (or handle real confirmation via websocket/poll)
  useEffect(() => {
    if (txNotification && !txNotification.isIncoming && txNotification.status === 'PENDING') {
      const timer = setTimeout(() => {
        setTxNotification(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
        
        // Sync: Also clear the pending deduction from wallet state when UI confirms
        setWalletState(prev => {
          const next = { ...prev, pendingDeduction: 0 };
          localStorage.setItem('kaspa_wallet_state', JSON.stringify(next));
          return next;
        });
      }, 2000); // 2 seconds visual pending for real on-chain TX
      return () => clearTimeout(timer);
    }
  }, [txNotification]);

  // Auto-dismiss after confirmation
  useEffect(() => {
    if (txNotification && txNotification.status === 'CONFIRMED') {
      const timer = setTimeout(() => {
        setTxNotification(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [txNotification]);

  useEffect(() => {
    fetchKaspaPrice().then((p) => {
      if (p && p > 0) {
        setKaspaPrice(p);
      }
    });

    fetchKaspaMainnetInfo().then((info) => {
      if (info && info.blueScore) {
        setKaspaBlueScore(info.blueScore);
      }
    });

    socket.on('kaspaPriceTick', (data: { price: number }) => {
      if (data && data.price) {
        setKaspaPrice(data.price);
      }
    });

    const blueScoreInterval = setInterval(() => {
      setKaspaBlueScore(prev => prev + 1);
    }, 1000);

    return () => {
      socket.off('kaspaPriceTick');
      clearInterval(blueScoreInterval);
    };
  }, []);

  // World Cup Tournament Stage Management
  const [showTournament, setShowTournament] = useState(false);
  const [tournamentStage, setTournamentStage] = useState<'group' | 'quarter' | 'semi' | 'finals' | 'champion'>('group');
  const [tournamentWins, setTournamentWins] = useState(0);

  const [showGarage, setShowGarage] = useState(false);
  const [carConfig, setCarConfig] = useState<CarConfig>(() => {
    let unlockedIds: string[] = ['viper'];
    try {
      const savedUnlocked = localStorage.getItem('turbo_unlocked_cars');
      if (savedUnlocked) {
        const parsed = JSON.parse(savedUnlocked);
        if (Array.isArray(parsed) && parsed.length > 0) {
          unlockedIds = Array.from(new Set(['viper', ...parsed]));
        }
      }
    } catch {
      unlockedIds = ['viper'];
    }

    const saved = localStorage.getItem('turbo_car_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const selectedCarId = unlockedIds.includes(parsed.selectedCarId) ? parsed.selectedCarId : (unlockedIds[0] || 'viper');
        return {
          selectedCarId,
          color: parsed.color || '#3b82f6',
          upgrades: {
            engine: parsed.upgrades?.engine ?? 0,
            nos: parsed.upgrades?.nos ?? 0,
            tires: parsed.upgrades?.tires ?? 0,
            chassis: parsed.upgrades?.chassis ?? 0,
          },
          cosmetics: {
            underglowColor: parsed.cosmetics?.underglowColor || 'transparent',
            smokeColor: parsed.cosmetics?.smokeColor || '#ffffff',
            spoilerType: parsed.cosmetics?.spoilerType || 'none',
          }
        };
      } catch {
        // ignore
      }
    }
    return {
      selectedCarId: 'viper',
      color: '#3b82f6',
      upgrades: {
        engine: 0,
        nos: 0,
        tires: 0,
        chassis: 0,
      },
      cosmetics: {
        underglowColor: 'transparent',
        smokeColor: '#ffffff',
        spoilerType: 'none',
      }
    };
  });

  const handleSaveConfig = (newConfig: CarConfig) => {
    setCarConfig(newConfig);
    localStorage.setItem('turbo_car_config', JSON.stringify(newConfig));
    if (socket.connected) {
      socket.emit('updateCarConfig', newConfig);
    }
  };

  const handleKasItemPurchase = async (amountKas: number, itemName: string, itemMetadata: string): Promise<boolean> => {
    try {
      if (!walletState.isConnected || !walletState.address) {
        setError('Please connect your Kaspa wallet first to purchase this item.');
        return false;
      }

      if (walletState.balanceKas < amountKas) {
        setError(`A balance of ${amountKas} KAS is needed to purchase this item. Please fund your wallet.`);
        return false;
      }

      setError('');

      const res = await executeKaspaItemPurchase(walletState, amountKas, itemName, itemMetadata);
      if (res.success) {
        // Automatically persist unlocked car or purchased item in localStorage
        if (itemMetadata.includes('item_type:car')) {
          const match = itemMetadata.match(/car_id:([^|]+)/);
          if (match && match[1]) {
            const carId = match[1];
            try {
              const saved = localStorage.getItem('turbo_unlocked_cars');
              const existing: string[] = saved ? JSON.parse(saved) : ['viper'];
              const updatedUnlocked = Array.from(new Set([...existing, carId]));
              localStorage.setItem('turbo_unlocked_cars', JSON.stringify(updatedUnlocked));
            } catch {}
          }
        }
        try {
          const savedItems = localStorage.getItem('turbo_purchased_items');
          const existingItems: string[] = savedItems ? JSON.parse(savedItems) : [];
          const updatedItems = Array.from(new Set([...existingItems, itemMetadata]));
          localStorage.setItem('turbo_purchased_items', JSON.stringify(updatedItems));
        } catch {}

        handleWalletUpdate(res.newWalletState);
        setTxNotification({
          id: `item-${Date.now()}`,
          txHash: res.txHash,
          amountKas,
          label: itemName,
          explorerUrl: res.explorerUrl,
          timestamp: Date.now(),
          blueScore: res.onChainProof.kaspaBlueScore,
          isIncoming: false,
          status: 'PENDING',
        });
        return true;
      }
    } catch (err: any) {
      setError(err.message || 'Kaspa purchase failed');
      return false;
    }
    return false;
  };

  const handleQuitGame = () => {
    socket.disconnect();
    setRoomCode('');
    setPlayers({});
    setIsHost(false);
    setView('landing');
    setHasPaid(false);
    socket.connect();
  };

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players, isHost }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setView('lobby');
      setError('');
    });

    socket.on('roomJoined', ({ roomId, players, isHost }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setView('lobby');
      setError('');
    });

    socket.on('playerJoinedRoom', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('roomPlayersUpdated', (playersList) => {
      setPlayers(playersList);
    });

    socket.on('gameStarted', (initialPlayers) => {
      // Attempt to lock orientation if possible (requires user gesture/event)
      const screenAny = window.screen as any;
      if (screenAny && screenAny.orientation && screenAny.orientation.lock) {
        screenAny.orientation.lock('landscape').catch(() => {
          // Fail silently if not supported
        });
      }

      setPlayers(initialPlayers);
      setView('game');
    });

    socket.on('error', (msg) => {
      setError(msg);
    });
    
    socket.on('hostMigrated', (newHostId) => {
      if (socket.id === newHostId) {
        setIsHost(true);
      }
    });

    const onConnect = () => {
      socket.emit('getPublicRooms');
    };

    socket.on('connect', onConnect);

    socket.on('publicRoomsList', (roomsList) => {
      setPublicRooms((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(roomsList)) return prev;
        return roomsList;
      });
    });

    socket.emit('getPublicRooms');

    const pollInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('getPublicRooms');
      }
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      socket.off('connect', onConnect);
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('playerJoinedRoom');
      socket.off('playerDisconnected');
      socket.off('gameStarted');
      socket.off('roomPlayersUpdated');
      socket.off('error');
      socket.off('hostMigrated');
      socket.off('publicRoomsList');
    };
  }, []);

  const handleCreate = () => {
    setError('');
    if (socket.connected) {
      socket.emit('createRoom');
    } else {
      const generatedRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const myId = 'racer_' + Math.random().toString(36).substring(2, 6);
      setRoomCode(generatedRoomId);
      setPlayers({
        [myId]: {
          id: myId,
          name: `Racer_${myId.substring(0, 4)}`,
          color: carConfig?.color || '#3b82f6',
          isHost: true,
        }
      });
      setIsHost(true);
      setView('lobby');
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCode = joinCode.trim().toUpperCase();
    if (!targetCode || targetCode.length !== 6) {
      setError('Please enter a valid 6-character room code');
      return;
    }

    setError('');
    if (socket.connected) {
      socket.emit('joinRoom', { roomId: targetCode });
    } else {
      const myId = 'racer_' + Math.random().toString(36).substring(2, 6);
      setRoomCode(targetCode);
      setPlayers({
        [myId]: {
          id: myId,
          name: `Racer_${myId.substring(0, 4)}`,
          color: carConfig?.color || '#3b82f6',
          isHost: false,
        }
      });
      setIsHost(false);
      setView('lobby');
    }
  };

  const handlePayAndReady = async () => {
    try {
      if (!walletState.isConnected || !walletState.address) {
        setError('Please connect your Kaspa wallet first to pay the race entry fee.');
        return;
      }

      if (walletState.balanceKas < 0.005) {
        setError('A network fee of 0.005 KAS is needed to start the race on-chain. Please fund your wallet.');
        return;
      }

      setError('');
      const res = await executeKaspaRaceEntry(walletState);
      setWalletState(res.newWalletState);
      localStorage.setItem('kaspa_wallet_state', JSON.stringify(res.newWalletState));

      setTxNotification({
        id: res.txHash,
        txHash: res.txHash,
        amountKas: res.deductedAmount,
        label: 'RACE ACTIVATION',
        explorerUrl: res.explorerUrl,
        timestamp: Date.now(),
        blueScore: kaspaBlueScore,
        status: 'PENDING',
      });

      setHasPaid(true);

      // Tell socket relay server that we are paid and ready
      if (socket.connected) {
        socket.emit('playerReady', { isReady: true });
        
        // If solo lobby on server, automatically start game
        if (Object.keys(players).length === 1) {
          socket.emit('startGame');
        }
      } else {
        // Solo offline play support
        const myId = Object.keys(players)[0] || 'racer_local';
        setPlayers((prev) => ({
          ...prev,
          [myId]: {
            ...prev[myId],
            isReady: true,
          }
        }));
        setView('game');
      }
    } catch (err: any) {
      setError(err.message || 'Transaction failed. Please ensure you have real Kaspa deposited in your wallet.');
    }
  };

  const handleLaunchGame = () => {
    if (!hasPaid) return;
    if (socket.connected) {
      socket.emit('startGame');
    } else {
      setView('game');
    }
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative min-h-[100dvh] h-[100dvh] w-full max-w-full flex flex-col items-center justify-start overflow-hidden p-0 m-0 border-0 font-sans text-slate-100 selection:bg-yellow-500 selection:text-black`}>
      {/* 4D Animated Cinematic Racing Background & Overlay */}
      {view !== 'game' && !showGarage && <BackgroundRacingScene />}
      {view !== 'game' && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/15 to-slate-950/80 backdrop-blur-[1.5px] pointer-events-none z-10" />
      )}

      {view !== 'game' && (
        <header
          className="relative z-20 flex w-full max-w-none shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-4"
          style={{
            paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
            paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))'
          }}
        >
          <h1 className="min-w-0 shrink font-racing text-xl sm:text-2xl font-black tracking-tight text-white drop-shadow-md whitespace-nowrap">
            KASRACE
          </h1>

          <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2">
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1 text-[10px] font-mono font-bold text-slate-300 shadow-sm whitespace-nowrap">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="text-slate-400">KAS:</span>
              <span className="font-extrabold text-amber-400">{kaspaPrice ? kaspaPrice.toFixed(4) : '0.1250'}</span>
            </div>

            <button
              onClick={() => setShowWalletModal(true)}
              className="flex max-w-[38vw] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#70C7BA]/50 bg-slate-900/90 px-2 py-1 text-[10px] font-mono font-bold text-[#70C7BA] shadow-sm transition-all hover:border-[#70C7BA] hover:bg-slate-800 active:translate-y-0.5"
            >
              <Wallet className="h-3.5 w-3.5 shrink-0 text-[#70C7BA]" />
              {walletState.isConnected ? (
                <span className="truncate">{walletState.address.slice(0, 8)}...</span>
              ) : (
                <span className="truncate">CONNECT</span>
              )}
            </button>
          </div>
        </header>
      )}

      <main className={`flex-1 w-full ${view === 'game' ? 'h-full p-0 m-0 max-w-none border-0' : 'max-w-4xl p-2 sm:p-4 pt-safe pb-safe pl-safe pr-safe'} flex flex-col items-center justify-start z-20 min-h-0`}>
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 15, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.99 }}
              transition={{ duration: 0.3 }}
              className="p-4 sm:p-6 max-w-md w-full relative z-20 space-y-3 max-h-full my-auto"
            >
              <div className="text-center">
                <div className="text-red-500 text-xs font-bold mb-2 font-mono flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span>MAINNET</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-racing font-bold tracking-wide text-white mb-1">ONLINE PEER RACING</h2>
                <p className="text-xs sm:text-sm text-slate-300">Instant Peer Handshake • Real-Time Network Sync</p>
              </div>

              {error && <div className="text-rose-400 text-xs sm:text-sm text-center bg-rose-950/70 border border-rose-800/80 p-2.5 rounded-xl font-medium">{error}</div>}

              {/* Host Action */}
              <button
                type="button"
                onClick={handleCreate}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="w-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-racing font-bold py-3.5 px-4 rounded-xl shadow-xl transition-all active:scale-[0.98] text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 cursor-pointer border border-rose-500/40 select-none touch-manipulation z-30"
              >
                <span>CREATE RELAY ROOM</span>
              </button>

            </motion.div>
          )}

          {view === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 15, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.99 }}
              transition={{ duration: 0.3 }}
              className="p-1 sm:p-2 max-w-4xl w-full relative z-20 pb-1"
            >
              <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-800/80">
                <button
                  type="button"
                  onClick={handleQuitGame}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleQuitGame();
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-xs font-racing font-bold text-slate-300 border border-slate-700 transition-all cursor-pointer select-none touch-manipulation"
                >
                  ← LEAVE LOBBY
                </button>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>CONNECTED TO RELAY</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-3">
                <div className="space-y-2.5 sm:space-y-3">

                  {/* Current Joined Players */}
                  <div className="bg-slate-900/90 p-2.5 sm:p-3 rounded-xl border border-slate-800 shadow-xl">
                    <h3 className="text-xs font-racing font-bold tracking-wider mb-2 flex justify-between items-center text-slate-200">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-yellow-400" /> RACERS ({Object.keys(players).length})</span>
                      {isHost && <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold border border-yellow-500/30">HOST</span>}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-20 overflow-y-auto pr-0.5">
                      {Object.values(players).map(p => (
                        <div key={p.id} className="bg-slate-950/80 p-1.5 rounded-lg flex items-center justify-between border border-slate-800">
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-3 h-3 rounded-full shrink-0 shadow-sm border border-white/20" style={{ backgroundColor: p.color }}></div>
                            <span className="font-bold text-xs truncate text-slate-200">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {p.isReady ? (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">READY</span>
                            ) : (
                              <span className="text-[9px] bg-slate-800 text-slate-400 font-mono font-bold px-1.5 py-0.5 rounded border border-slate-700/50">NOT READY</span>
                            )}
                            {p.id === socket.id && <span className="text-[9px] text-slate-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800 shrink-0">(You)</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Selected Ride - Moved to column 1 */}
                  <div>
                    <AdvancedGarageButton onClick={() => setShowGarage(true)} carConfig={carConfig} />
                  </div>
                </div>
                
                <div className="space-y-2.5 sm:space-y-3 flex flex-col">
                  {/* Real Online Peer Rooms list from Socket Relay */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 sm:p-3 space-y-2 shadow-2xl shrink-0">
                    <div className="flex items-center justify-between text-xs font-racing font-bold tracking-wider text-slate-300 pb-1 border-b border-slate-800">
                      <span className="flex items-center gap-1.5 text-blue-400">
                        <Zap className="w-3.5 h-3.5 text-yellow-400 animate-pulse" /> ONLINE PEERS (P2P LIVE)
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>LIVE</span>
                      </span>
                    </div>

                    <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                      {publicRooms.filter(r => r.id !== roomCode).length > 0 ? (
                        publicRooms.filter(r => r.id !== roomCode).map((peer) => (
                          <div
                            key={peer.id}
                            className="bg-slate-950/90 hover:bg-slate-950 border border-blue-500/30 hover:border-blue-400 p-1.5 rounded-xl transition-all flex items-center justify-between gap-2 shadow-sm"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: peer.hostColor || '#3b82f6' }} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-mono font-bold text-yellow-400 truncate">ROOM {peer.id}</span>
                                </div>
                                <div className="text-[9px] text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                                  <span className="truncate">{peer.hostName}</span>
                                  <span>•</span>
                                  <span className="text-blue-400 font-mono font-bold">{peer.racersCount} Racer{peer.racersCount > 1 ? 's' : ''}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (socket.connected) {
                                  socket.emit('joinRoom', { roomId: peer.id, name: `Racer_${Math.random().toString(36).substring(2, 6)}`, color: carConfig?.color || '#3b82f6', carConfig });
                                } else {
                                  setRoomCode(peer.id);
                                }
                              }}
                              onTouchEnd={(e) => {
                                e.preventDefault();
                                if (socket.connected) {
                                  socket.emit('joinRoom', { roomId: peer.id, name: `Racer_${Math.random().toString(36).substring(2, 6)}`, color: carConfig?.color || '#3b82f6', carConfig });
                                } else {
                                  setRoomCode(peer.id);
                                }
                              }}
                              className="shrink-0 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-racing font-bold tracking-wider transition-all shadow-md cursor-pointer border border-blue-400/40 touch-manipulation flex items-center gap-1 select-none active:scale-95"
                            >
                              <Zap className="w-3 h-3 text-yellow-300 fill-yellow-300" />
                              <span>HANDSHAKE</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-2 px-2 text-slate-400 text-xs font-medium bg-slate-950/50 rounded-xl border border-slate-800/50 space-y-0.5">
                          <div className="text-emerald-400 font-mono font-bold text-[10px] flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            P2P Relay Node Active
                          </div>
                          <p className="text-[10px] text-slate-400">Searching for nearby peer rooms... Open another browser tab or share code to pair!</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Start Race Button - Now stays below the P2P card */}
                  <div className="mt-auto pt-1.5 sm:pt-2">
                    {!hasPaid ? (
                      <button
                        type="button"
                        onClick={handlePayAndReady}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          handlePayAndReady();
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-racing font-bold py-3 px-4 rounded-xl shadow-xl text-sm sm:text-base tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none m-0 touch-manipulation select-none"
                      >
                        <span>PAY ENTRY FEE & READY</span>
                      </button>
                    ) : isHost ? (
                      (Object.keys(players).length <= 1 || Object.values(players).filter(p => p.id !== socket.id).every(p => p.isReady)) ? (
                        <button
                          type="button"
                          onClick={handleLaunchGame}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            handleLaunchGame();
                          }}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-racing font-bold py-3 px-4 rounded-xl shadow-xl text-sm sm:text-base tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none m-0 touch-manipulation select-none animate-pulse"
                        >
                          <span>LAUNCH RACE!</span>
                        </button>
                      ) : (
                        <div className="text-center p-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 font-bold text-xs sm:text-sm animate-pulse tracking-wider">
                          WAITING FOR OTHER RACERS TO GET READY...
                        </div>
                      )
                    ) : (
                      <div className="text-center p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-xs sm:text-sm animate-pulse tracking-wider">
                        READY • WAITING FOR HOST TO LAUNCH...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="w-full h-full p-0 m-0 border-0 overflow-hidden"
            >
              <GameEngine 
                initialPlayers={players} 
                onQuit={handleQuitGame} 
                walletState={walletState}
                kaspaPrice={kaspaPrice}
                onPurchaseKasItem={handleKasItemPurchase}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Full-Screen Immersive Garage & Tuning Shop Modal for Landing / Lobby */}
      <AnimatePresence>
        {showGarage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-hidden flex flex-col justify-center items-center p-0"
          >
            <div className="w-full h-full max-w-7xl relative flex flex-col">
              <GarageView
                currentConfig={carConfig}
                onSaveConfig={handleSaveConfig}
                onClose={() => setShowGarage(false)}
                walletState={walletState}
                onPurchaseKasItem={handleKasItemPurchase}
                kaspaPrice={kaspaPrice}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* World Cup Tournament Championship Bracket Modal */}
      <AnimatePresence>
        {showTournament && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          >
            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 sm:p-8 max-w-3xl w-full text-left shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowTournament(false)}
                className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-slate-700"
              >
                CLOSE ✕
              </button>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-4xl">🏆</span>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-racing font-extrabold text-amber-400 tracking-wider">
                    2026 WORLD CUP RACING CHAMPIONSHIP
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-medium">Stage-by-Stage Knockout Tournament • Championship Trophy Cup</p>
                </div>
              </div>

              {/* Tournament Stages Progress Bar */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                {[
                  { id: 'group', title: 'STAGE 1', label: 'Group Stage' },
                  { id: 'quarter', title: 'STAGE 2', label: 'Quarter-Finals' },
                  { id: 'semi', title: 'STAGE 3', label: 'Semi-Finals' },
                  { id: 'finals', title: 'FINALS 🏆', label: 'World Cup Title' },
                ].map((s, idx) => {
                  const isActive = tournamentStage === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`p-2.5 sm:p-3 rounded-xl border text-center transition-all ${
                        isActive
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="text-[10px] font-mono font-bold tracking-wider">{s.title}</div>
                      <div className="text-xs font-bold truncate">{s.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Current Stage Match Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 mb-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-racing font-bold uppercase tracking-wider text-amber-400">CURRENT MATCHUP</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold border border-amber-500/30">ROUND 1 OF 4</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900 p-3.5 rounded-xl border border-blue-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-blue-400 font-bold font-mono">YOUR DRIVER</div>
                      <div className="text-sm sm:text-base font-bold text-slate-100">You (Pro Contender)</div>
                    </div>
                    <span className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded font-bold border border-blue-500/40">READY</span>
                  </div>

                  <div className="bg-slate-900 p-3.5 rounded-xl border border-rose-500/30 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-rose-400 font-bold font-mono">STAGE 1 OPPONENT</div>
                      <div className="text-sm sm:text-base font-bold text-slate-100">Marcus Vance (Viper GT)</div>
                    </div>
                    <span className="text-xs bg-rose-600/30 text-rose-300 px-2 py-1 rounded font-bold border border-rose-500/40">CHALLENGER</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowTournament(false)}
                  className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  RETURN TO LOBBY
                </button>
                <button
                  onClick={() => {
                    setShowTournament(false);
                    handleCreate();
                  }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-racing font-bold text-sm sm:text-base shadow-xl transition-all cursor-pointer border border-amber-300/50 active:translate-y-0.5"
                >
                  LAUNCH STAGE 1 RACE 🏎️
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <KaspaWalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        walletState={walletState}
        onWalletUpdate={handleWalletUpdate}
        kaspaPrice={kaspaPrice}
      />

      <KaspaTxHubNotification
        notification={txNotification}
        onDismiss={() => setTxNotification(null)}
      />

      {/* Forced Landscape Overlay for Mobile */}
      <AnimatePresence>
        {isMobile && !isLandscape && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              animate={{ rotate: 90 }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="mb-8 p-6 bg-slate-900 rounded-full border-2 border-amber-500/30 text-amber-400"
            >
              <Smartphone className="w-16 h-16" />
            </motion.div>
            <h2 className="text-2xl font-racing font-bold text-white mb-2 tracking-widest">LANDSCAPE MODE REQUIRED</h2>
            <p className="text-slate-400 max-w-xs leading-relaxed">
              Please rotate your device to landscape mode for the best racing experience.
            </p>
            
            <div className="mt-12 flex items-center gap-2 text-xs font-mono text-slate-500 uppercase tracking-tighter">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Waiting for rotation...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ultra-Clean Edge-to-Edge GameEngine.tsx Landscape Loading Screen Overlay */}
      <AnimatePresence>
        {isLandscape && isAppLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[900] bg-slate-950 flex flex-col justify-between items-center py-6 sm:py-10 px-4 sm:px-8 text-white select-none font-sans overflow-hidden"
            style={{ 
              paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))',
              paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
              paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'
            }}
          >
            {/* Top spacer for vertical balance */}
            <div className="h-2" />

            {/* GameEngine.tsx Title Only - Directly on dark background, no card container */}
            <div className="flex flex-col items-center justify-center text-center px-2">
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-racing font-extrabold text-white tracking-widest uppercase drop-shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                GameEngine<span className="text-cyan-400">.tsx</span>
              </h1>
            </div>

            {/* Always-Visible Processing Loading Bar */}
            <div className="w-full max-w-7xl mx-auto space-y-2">
              <div className="flex justify-between items-center px-1 sm:px-2 text-xs sm:text-sm font-mono font-bold">
                <span className="text-slate-400 tracking-widest">LOADING</span>
                <span className="text-cyan-400 font-mono text-sm sm:text-lg font-bold">
                  {appLoadingProgress}%
                </span>
              </div>

              {/* Full-width track with glowing progress bar */}
              <div className="w-full h-3 sm:h-4 bg-slate-900 border border-slate-800/80 rounded-full p-0.5 relative overflow-hidden shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-150 relative overflow-hidden shadow-[0_0_15px_#06b6d4]"
                  style={{ width: `${Math.max(2, appLoadingProgress)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
