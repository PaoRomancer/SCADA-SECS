# 🏢 Datacenter Cooling System

A simulated SCADA web application for monitoring and exploring the management of a data center cooling system. Built with Nuxt 4 and Vue 3, with support for both Thai and English.

> ⚠️ **Simulation only:** This project uses simulated data in the browser. It does not connect to PLCs, BMSs, or real equipment, and must not be used to operate live systems.

## ✨ Features

- 📊 Dashboard with an overview of energy, IT load, cooling power, PUE, and system efficiency
- ❄️ Simulated Chiller, CRAH, and zone views, including Power, PV, and ESS
- 📈 Simulated charts and telemetry, with alarm statuses and an event log
- 🌐 Thai/English language switching and display themes
- 🔐 User role simulation and a two-step command confirmation workflow
- 📂 Import simulated data from CSV, download current data, and download a CSV template

## 🧰 Tech Stack

- [Nuxt 4](https://nuxt.com/)
- [Vue 3](https://vuejs.org/)
- [Lucide](https://lucide.dev/)

## 🚀 Getting Started

Make sure Node.js and npm are installed, then run:

```bash
npm install
npm run dev
```

Open the app at <http://localhost:3000>.

### 🛠️ Common Commands

```bash
npm run dev       # Start the development server
npm run build     # Build for production
npm run preview   # Preview the production build
npm run generate  # Generate a static site
```

## 👤 Demo Accounts

The login page provides the following accounts for exploring the app. These passwords are simulated credentials stored in client-side code and must not be used as credentials for a real system.

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Administrator |
| `operator` | `operator123` | System Operator |
| `engineer` | `engineer123` | HVAC Engineer |
| `viewer` | `viewer123` | Viewer |

## 📄 Simulated CSV Data

The app supports daily telemetry datasets with 1,440 data points (one per minute). The `it` and `cool` columns are required, while `time` is optional. If omitted, timestamps from `00:00` to `23:59` are generated automatically.

Supported optional columns are `pit`, `pcool`, `lim`, `pv`, `pv2l`, `pv2e`, `esd`, `soc`, `grid`, and `mode`. See the app's **Settings** page for examples and additional details about each column.

## 🗂️ Project Structure

```text
app/
  assets/css/     App styles
  data/           Simulated data
  pages/          Nuxt pages
  utils/          Client-side SCADA logic and icons
public/image/     Logos and images used in the app
```

## 📦 Build and Deploy

Run `npm run build` to build the Nuxt app, or `npm run generate` to generate a static site that can be hosted on a static hosting service. See the [Nuxt deployment guide](https://nuxt.com/docs/getting-started/deployment) for more options.
