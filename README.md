# 🏎️ Kasrace: 4D Realtime Multiplayer Racing

[![Build Android APK](https://github.com/your-username/kasrace/actions/workflows/build-apk.yml/badge.svg)](https://github.com/your-username/kasrace/actions/workflows/build-apk.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

**Kasrace** is a high-speed, 4D hyperdimensional real-time multiplayer racing game. Featuring instant Peer-to-Peer (P2P) lag-compensated matchmaking, secure **Kaspa Web3 Wallet** integrations, a beautiful high-fidelity physics simulator, a highly custom garage upgrade system, a Progressive Web App (PWA) installation layer, and an automated continuous integration pipeline compiling native **Android APKs** directly on GitHub push.

---

## ✨ Features At A Glance

- **4D Hyperdimensional Racing Scene**: An immersive visual background utilizing Three.js WebGL and custom fragment shaders rendering interactive geometric structures of a 4rd dimensional spacetime dimension.
- **Realtime Lag-Compensated Multiplayer**: Multi-car lobbies brokered by a Socket.io matchmaking server, coordinating ultra-low latency inputs and spatial telemetry using high-frequency **PeerJS (RTCDataChannel)** connections.
- **Kaspa Web3 Integration**: Fully client-side BIP39 mnemonic passphrase generators and BIP32 hierarchical deterministic wallets. Securely query UTXOs, sign transactions, process low-cost micro-entry fees, and distribute reward pools on the Kaspa Mainnet.
- **Interactive Garage and Upgrade Bay**: Fully customize your vehicle's engine, aerodynamics, tires, paints, and performance tuning with custom Three.js 3D showrooms.
- **Engine Synthesizer & Audio System**: Advanced custom audio synthesis engine translating instant tire friction, speed differentials, and motor RPM into real-time sound frequencies, complete with a multi-layered automated fallback music system.
- **Continuous Integration APK Pipeline**: Embedded GitHub Actions workflow compiling native Android app packages via Capacitor and Gradle upon branch pushes.

---

## 🏗️ Project Architecture & Directory Structure

Here is a complete, structural tour of the codebase to guide developers contributing to Kasrace:

```
Kasrace/
├── .github/
│   └── workflows/
│       └── build-apk.yml       # GitHub Actions pipeline for automated Android APK builds
├── android/                    # Capacitor-generated native Android Studio project
├── app/                        # Compiled native app directory assets
├── public/                     # Static assets (icons, manifest, sound effects)
│   ├── favicon.png             # Game favicon logo
│   ├── manifest.json           # Web App Manifest config for PWA features
│   └── racing_music.mp3        # Main racing background soundtrack
├── src/                        # Primary frontend source code
│   ├── main.tsx                # React application bootstrapper & global style mounts
│   ├── App.tsx                 # Central screen state controller and router
│   ├── types.ts                # Rigid TypeScript interfaces and common gaming types
│   ├── index.css               # Global Tailwind CSS directives and theme colors
│   ├── polyfills.ts            # Node.js cryptographical and buffer polyfills
│   ├── assert-polyfill.ts      # Core-library assert definitions
│   │
│   ├── components/             # React visual UI modules
│   │   ├── GameEngine.tsx      # Core 2D Canvas rendering, input processing, and physics loops
│   │   ├── GarageView.tsx      # Vehicle upgrade, modification, and performance tuning layout
│   │   ├── KaspaWalletModal.tsx# BIP39 wallet setup, balances, and mnemonic manager
│   │   ├── KaspaTxHubNotification.tsx # Reactive transactional HUD alerts
│   │   ├── OpponentCar.tsx     # Lag-compensated network interpolation module
│   │   └── 4d/                 # Three.js 3D/4D visual engines
│   │       ├── BackgroundRacingScene.tsx # Hyperdimensional spacetime racing backdrop
│   │       └── CarShowcaseEngine.tsx     # 3D interactive garage showroom rendering
│   │
│   ├── data/                   # Shared static game configurations
│   │   └── cars.ts             # Vehicle archetypes, upgrade variables, and stats mapping
│   │
│   └── services/               # Underlying network and blockchain microservices
│       ├── kaspaMainnet.ts     # Mainnet transaction building, signing, and UTXO retrievals
│       ├── p2p.ts              # PeerJS initialization and WebRTC peer channels
│       ├── socket.ts           # Socket.io lobby directories and host coordination
│       └── zkVerifier.ts       # Anti-cheat proof-verification checks and telemetry logs
│
├── server.ts                   # Node.js high-performance HTTP/Socket.io signaling server
├── fix-secp256k1.js            # Wasm compilation helper script & music downloader
├── capacitor.config.ts         # Capacitor structural mobile deployment configurations
├── metadata.json               # Platform configuration and capability manifests
├── package.json                # Explicit dependencies and run-scripts mapping
├── tsconfig.json               # TypeScript compiler rules
└── vite.config.ts              # Custom Vite configuration file
```

---

## 🛠️ Development & Build Scripts

The codebase is equipped with optimized development, optimization, and packaging pipelines:

| Command | Action |
|:---|:---|
| `npm run dev` | Runs the Node.js signaling server with live Vite HMR middleware via `tsx`. |
| `npm run build` | Bundles React via Vite, compiles `server.ts` to high-performance CJS via `esbuild`. |
| `npm run start` | Boots the compiled standalone Production HTTP & Socket.io server. |
| `npm run lint` | Runs TypeScript static analysis checking for typesafe parameters. |
| `npm run clean` | Purges existing production builds and cache directories. |
| `npm run build:android` | Builds static assets and synchronizes assets with native Android frameworks. |
| `npm run cap:sync` | Updates Android plugins and matches JavaScript updates with native files. |
| `npm run cap:open` | Launches the complete android project inside Android Studio instantly. |

---

## 🚀 Step-by-Step Installation & Local Execution

Follow these steps to set up and launch your local development environment:

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [NPM](https://www.npmjs.com/) (packaged with Node.js)
- *Optional (for Android compilation)*: [Android Studio](https://developer.android.com/studio) and JDK 17.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/kasrace.git
cd kasrace
```

### 2. Install Project Dependencies
Run the installation command. This executes a postinstall script compiling WebAssembly boundaries for `secp256k1-wasm` and ensures local audio files are downloaded:
```bash
npm install
```

### 3. Launch the Development Server
Execute the dev server script to spin up the web client and backend on port `3000`:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 4. Build and Launch Standalone Production Bundle
To compile and test the high-efficiency production build:
```bash
npm run build
npm start
```

---

## 📱 Mobile Compilation (Native Android APK)

Kasrace can be bundled into a native, high-performance Android package (APK).

### Automated CI Pipeline (Recommended)
This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/build-apk.yml`). 
1. Push your changes to the `main` or `master` branch of your GitHub repository.
2. Navigate to the **Actions** tab on your GitHub repository page.
3. Click on the latest **Build Android APK** workflow run.
4. Download the generated `kasrace.apk` artifact from the run's summary page!

### Manual Local Compilation
To compile the APK locally using your Android Studio environment:
```bash
# 1. Compile web assets & sync them with the Android platform
npm run build:android

# 2. Sync native configuration
npm run cap:sync

# 3. Open the workspace in Android Studio
npm run cap:open
```
In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The resulting APK will be ready at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🎮 Game Controls & Customization

- **Steering / Controls**:
  - `W` / `Arrow Up` - Accelerate
  - `S` / `Arrow Down` - Brake / Reverse
  - `A` / `Arrow Left` - Steer Left
  - `D` / `Arrow Right` - Steer Right
  - `Spacebar` - Drift & Slide Handbrake
  - `Shift` - Engage Nitro Booster
- **Mobile Integration**: Responsive touch-screen controls, containing a visual overlay of analog steering wheels, accelerator triggers, and handbrake sliders.
- **Kaspa Web3 Mechanics**:
  - Connect your secure seed phrase or generate a new Kasrace wallet.
  - Join high-reward tournaments by sending entry fees to lobby smart-pools.
  - Claim distributed rewards directly to your personal address, authenticated by client-side zk-proofs.

---

## 🛡️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

*Made with 🏎️ by the Kasrace Development Team.*
