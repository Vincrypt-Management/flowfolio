# Vibe Invest (Flowfolio)

**Privacy-first desktop investment planning and portfolio management**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8D8?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-CE422B?logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)

---

## 🎯 Overview

Vibe Invest is a **desktop-native investment application** that helps you:
- Create vibe-based investment strategies with factor-driven allocation
- Generate explainable rankings with factor drill-down
- Get monthly buy lists based on target allocations
- Run historical backtests with cadence-based rebalancing
- Maintain an investment journal for reflections and decisions

**Privacy Promise:** All data stored locally. No cloud dependencies. Zero telemetry.

---

## ✨ Features

### 🎨 Vibe Studio
- Pre-built strategy templates (Growth, Value, Balanced, etc.)
- Custom factor weighting and constraints
- Real-time validation (weights, limits, sector caps)

### 📊 Explainable Rankings
- Multi-factor scoring (momentum, value, quality, growth, size, volatility)
- Factor breakdown with contribution analysis
- "Why included/excluded" explanations

### 💼 Portfolio Management
- Current holdings tracking
- Target vs actual allocation comparison
- Drift calculation
- Monthly buy list generation
- Transaction history

### 🔬 Backtest Lab
- Historical simulation with configurable cadence
- Performance metrics (returns, volatility, Sharpe ratio, max drawdown)
- Fully offline operation on cached data
- Multiple strategy comparison

### 📝 Investment Journal
- Track decisions and reflections
- Tag entries by type (buy, sell, review, etc.)
- Timeline view with statistics

---

## 🚀 Quick Start

### Prerequisites

- **Rust** 1.75+ ([Install](https://www.rust-lang.org/tools/install))
- **Node.js** 20.x LTS ([Install](https://nodejs.org/))
- **Tauri CLI**: `cargo install tauri-cli`

### Installation

```bash
# Clone repository
git clone <repository-url>
cd flowfolio

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Production Build

```bash
# Build application
npm run tauri build

# Output location:
# - macOS: src-tauri/target/release/bundle/macos/
# - Windows: src-tauri/target/release/bundle/msi/
# - Linux: src-tauri/target/release/bundle/appimage/
```

---

## 🔒 Security

This application prioritizes your privacy and security:

- ✅ **Zero Cloud Dependencies** - All data stored locally in SQLite
- ✅ **No Telemetry** - No analytics, tracking, or data collection
- ✅ **Encrypted Secrets** - API keys stored via Tauri Stronghold
- ✅ **CSP Protected** - Content Security Policy prevents injection attacks
- ✅ **Capability Restricted** - Minimal permissions model
- ✅ **Auditable** - Run `./security_check.sh` to verify

**See:** [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) for details.

---

## 📖 Documentation

- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Current development status and roadmap
- **[SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md)** - Security requirements and validation
- **[BUILD_REPRODUCIBILITY.md](BUILD_REPRODUCIBILITY.md)** - Build instructions and signing
- **[EPIC_H_COMPLETION.md](EPIC_H_COMPLETION.md)** - Security hardening report

---

## 🛠️ Technology Stack

**Frontend:**
- React 19 with TypeScript
- Vite for fast builds
- CSS for styling

**Backend:**
- Tauri 2 (Rust + WebView)
- SQLite via SQLx
- Reqwest for HTTP
- Governor for rate limiting

**Security:**
- Tauri Plugin Stronghold (encrypted storage)
- Content Security Policy
- Minimal capability model

---

## 📊 Project Status

**Current Version:** 0.1.0 MLP  
**Status:** ✅ Core Development Complete

### Completed Epics

- ✅ **Epic A** - App shell + security baseline
- ✅ **Epic B** - Database + schema
- ✅ **Epic C** - Data provider module
- ✅ **Epic D** - Vibe plan compiler
- ✅ **Epic E** - Scoring + ranking engine
- 🚧 **Epic F** - Portfolio construction (partial)
- ✅ **Epic G** - Backtest lab
- ✅ **Epic H** - Packaging + hardening

**See:** [PROJECT_STATUS.md](PROJECT_STATUS.md) for detailed progress.

---

## 🧪 Testing

### Run Security Audit
```bash
./security_check.sh
```

### Run TypeScript Checks
```bash
npm run lint
```

### Run Rust Tests
```bash
cd src-tauri
cargo test
```

---

## 🗺️ Roadmap

### MLP (Current) ✅
- Core features implemented
- Security hardening complete
- Local-first operation

### Phase 2
- Natural language plan generation
- Advanced backtest metrics
- Tax-aware optimization
- Code signing implementation

### Phase 3
- Mobile companion app
- Broker import (CSV/OFX)
- Custom factor development UI
- Community templates

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Follow code style (rustfmt, prettier)
4. Run `./security_check.sh` before submitting
5. Open a pull request

---

## 📝 License

**To Be Determined**

---

## 🙏 Acknowledgments

**Built With:**
- [Tauri](https://tauri.app/) - Desktop framework
- [React](https://react.dev/) - UI library
- [Rust](https://www.rust-lang.org/) - Backend language
- [SQLite](https://www.sqlite.org/) - Database
- [Alpha Vantage](https://www.alphavantage.co/) - Market data API

---

## 📧 Contact

**Security Issues:** Use GitHub Security Advisory  
**General Questions:** Open an issue

---

**Made with ❤️ for privacy-conscious investors**

