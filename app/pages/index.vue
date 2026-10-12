<script setup>
import { onMounted } from 'vue'
import { renderLucideIcons } from '~/utils/icons.js'

onMounted(async () => {
  renderLucideIcons()
  await import('~/utils/scada.client.js')
  renderLucideIcons()
})
</script>

<template>
<!-- ================= LOGIN SCREEN ================= -->

  <!-- ================= TWO-STEP COMMAND VERIFICATION MODAL ================= -->
  <div id="cmdModal" class="modal-backdrop" style="display:none">
    <div class="modal-card" id="cmdCard">
      <div class="modal-header">
        <div class="modal-badge-warn">
          <i data-lucide="triangle-alert"></i> <span data-i18n="twoStepHeader">SAFETY INTERLOCK · TWO-STEP COMMAND</span>
        </div>
        <button class="modal-close" id="btnCmdClose" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <h3 id="cmdModalTitle" data-i18n="twoStepConfirmTitle">Confirm Equipment Operation</h3>
        <p class="modal-desc" data-i18n="twoStepConfirmSub">
          Select-Before-Operate (SBO) verification required. Please review the target equipment and re-enter your
          Security PIN to execute.
        </p>

        <div class="cmd-target-box">
          <div class="cmd-target-icon" id="cmdTargetIcon"><i data-lucide="zap"></i></div>
          <div class="cmd-target-info">
            <div class="cmd-target-name" id="cmdTargetName">Chiller CH-01</div>
            <div class="cmd-target-action" id="cmdTargetAction">Command: START / OVERRIDE</div>
          </div>
          <div class="cmd-target-operator">
            <span class="op-label" data-i18n="twoStepOperator">Operator</span>
            <b id="cmdOperatorName">admin</b>
            <span class="op-role" id="cmdOperatorRole">Administrator</span>
          </div>
        </div>

        <div id="cmdAlert" class="login-alert" style="display:none;margin-bottom:12px;">
          <span class="alert-icon"><i data-lucide="triangle-alert"></i></span>
          <span id="cmdAlertMsg">Invalid PIN or password.</span>
        </div>

        <div class="cmd-pin-section">
          <label for="inpCmdPin">
            <span data-i18n="twoStepPinLabel">Security PIN / Account Password</span>
          </label>
          <div class="cmd-pin-wrap">
            <input type="password" id="inpCmdPin" placeholder="PIN: 1234" autocomplete="off" maxlength="20">
          </div>
          <div class="cmd-pin-hint">
            <i data-lucide="lightbulb" style="width:13px;height:13px;margin-right:4px;"></i>
            <span data-i18n="twoStepPinHint">Demo PIN: <b>1234</b> or your account password</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-modal btn-cancel" id="btnCmdCancel" data-i18n="twoStepCancel">Cancel</button>
        <button type="button" class="btn-modal btn-confirm" id="btnCmdConfirm">
          <i data-lucide="zap"></i> <span data-i18n="twoStepConfirm">Authorize &amp; Execute</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ================= FULL SCREEN GRAPH POPUP MODAL ================= -->
  <div id="chartFsModal" class="modal-backdrop" style="display:none">
    <div class="chart-fs-card" id="chartFsCard">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="fs-icon"><i data-lucide="chart-column"></i></span>
          <h3 id="chartFsTitle" style="margin:0;font-size:15px;font-weight:700;color:#fff">Chart Full Screen</h3>
        </div>
        <button class="modal-close" id="btnChartFsClose" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body chart-fs-body">
        <div id="chartFsInfo" class="fs-info-bar">
          <span id="chartFsTime" class="num" style="color:var(--accent);font-weight:700;font-size:13px">--:--</span>
          <div id="chartFsSub"
            style="color:var(--ink2);font-size:12px;margin-left:10px;display:flex;align-items:center;flex-wrap:wrap;gap:8px">
          </div>
        </div>
        <div class="chartbox fs-chartbox">
          <canvas id="cvFs" height="480"></canvas>
        </div>
        <div class="legend" id="lgFs" style="padding-top:10px"></div>
      </div>
    </div>
  </div>

  <div id="loginView">
    <div class="login-glow"></div>
    <div class="login-card" id="loginCard">
      <div class="login-hdr">
        <div class="login-logos">
          <img src="/image/Delta_logo.png" alt="Delta Electronics Logo" class="login-logo-delta">
          <span class="brand-sep">|</span>
          <img src="/image/KMITL_logo.png" alt="KMITL Logo" class="login-logo-kmitl">
        </div>
        <h2 data-i18n="loginTitle">Delta SCADA Gateway</h2>
        <p data-i18n="loginSub">Data Center Cooling &amp; Infrastructure Simulation</p>
        <div class="login-badge"><i></i><span data-i18n="loginBadge">SECURITY GATEWAY · ONLINE</span></div>
      </div>

      <div class="login-alert" id="loginAlert">
        <span class="alert-icon" style="font-size:14px"><i data-lucide="triangle-alert"></i></span>
        <span id="loginAlertMsg" data-i18n="loginErr">Invalid username or key</span>
      </div>

      <form class="login-form" id="loginForm" onsubmit="return false;">
        <div class="form-group">
          <label for="inpUser"><span data-i18n="loginUserLabel">Username</span></label>
          <div class="input-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <input type="text" id="inpUser" autocomplete="username" placeholder="e.g. admin" required autofocus>
          </div>
        </div>

        <div class="form-group">
          <label for="inpPass"><span data-i18n="loginPassLabel">Security Key / Password</span></label>
          <div class="input-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <input type="password" id="inpPass" autocomplete="current-password" placeholder="e.g. admin123" required>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--ink2)">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="chkRemember" checked style="accent-color:var(--accent)">
            <span data-i18n="loginRemember">Remember session</span>
          </label>
          <div style="display:flex;align-items:center;gap:12px">
            <button type="button" id="btnLoginLang"
              style="background:transparent;border:0;color:var(--accent);cursor:pointer;font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
              <i data-lucide="globe" style="width:13px;height:13px"></i>
              TH / EN</button>
            <button type="button" id="btnLoginTheme"
              style="background:transparent;border:0;color:var(--accent);cursor:pointer;font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
              <i data-lucide="sun" style="width:13px;height:13px"></i>
              Light</button>
          </div>
        </div>

        <button type="submit" class="login-btn" id="btnLogin">
          <i data-lucide="lock" style="width:16px;height:16px"></i> <span id="loginBtnText" data-i18n="loginBtn">ACCESS SCADA SYSTEM</span>
        </button>
      </form>

      <div class="login-preset-box">
        <button type="button" class="preset-toggle-btn" id="btnTogglePresets">
          <span style="display:inline-flex;align-items:center;gap:6px">
            <i data-lucide="key-round" style="width:14px;height:14px"></i>
            <span data-i18n="loginPresetHint">Demo Accounts / บัญชีทดสอบจำลอง</span>
          </span>
          <span class="preset-arrow" id="presetArrow"><i data-lucide="chevron-down" style="width:13px;height:13px"></i></span>
        </button>
        <div class="preset-content" id="presetContent" style="display:none">
          <div class="preset-chips">
            <div class="pchip" data-u="admin" data-p="admin123">
              <b><i data-lucide="crown" style="width:13px;height:13px"></i> admin</b>
              <span data-i18n="loginRoleAdmin">System Administrator</span>
            </div>
            <div class="pchip" data-u="operator" data-p="operator123">
              <b><i data-lucide="settings" style="width:13px;height:13px"></i> operator</b>
              <span data-i18n="loginRoleOp">Plant Operator</span>
            </div>
            <div class="pchip" data-u="engineer" data-p="engineer123">
              <b><i data-lucide="wrench" style="width:13px;height:13px"></i> engineer</b>
              <span data-i18n="loginRoleEng">HVAC Engineer</span>
            </div>
            <div class="pchip" data-u="viewer" data-p="viewer123">
              <b><i data-lucide="eye" style="width:13px;height:13px"></i> viewer</b>
              <span data-i18n="loginRoleView">Guest / Viewer</span>
            </div>
          </div>
        </div>
      </div>

      <div class="login-footer">
        <span>Delta Electronics · KMITL · Parameter Team <br> SCADA Simulation <br>Create by: Natthawit N.(KMITL) · Satthawut S.(KMITL) · Kittituch B.(KMITL)</span>
      </div>
    </div>
  </div>

  <!-- ================= SCADA APPLICATION CONTAINER ================= -->
  <div id="scadaApp" style="display:none">
    <div id="top">
      <div class="brand">
        <img src="/image/Delta_logo.png" alt="Delta Logo" class="brand-logo logo-delta">
        <span class="brand-sep">|</span>
        <img src="/image/KMITL_logo_transparent.png" alt="KMITL Logo" class="brand-logo logo-kmitl">
        <span class="brand-sep">|</span>
        <img src="/image/Parameter_logo_transparent.png" alt="Parameter Logo" class="brand-logo logo-parameter">
      </div>
      <div class="tstrip">
        <div class="tcell">
          <div class="k" data-i18n="kTotal">Total Power</div>
          <div class="v num" id="tTotal">–<small>kW</small></div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kIT">IT Load</div>
          <div class="v num" id="tIT">–<small>kW</small></div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kCool">Cooling Power</div>
          <div class="v num" id="tCool">–<small>kW</small></div>
        </div>
        <div class="tcell acc">
          <div class="k" data-i18n="kPUE">PUE (live)</div>
          <div class="v num" id="tPUE">–</div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kKwrt">Plant Efficiency</div>
          <div class="v num" id="tKwrt">–<small>kW/RT</small></div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kAmb">Ambient</div>
          <div class="v num" id="tAmb">–<small>°C</small></div>
        </div>
        <div class="tcell" id="clockCell">
          <div class="k" id="tDate">2026-08-09</div>
          <div class="v num" id="tClock">00:00:00</div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kMode">System Mode</div>
          <div class="v"><span class="badge b-ok" id="tMode"><i></i>–</span></div>
        </div>
        <div class="tcell">
          <div class="k" data-i18n="kAlarms">Active Alarms</div>
          <div class="v"><span class="badge b-alm" id="tAlm"><i></i>0</span></div>
        </div>
        <div class="user-cell" id="userCell">
          <div class="user-avatar" id="userAvatar"><i data-lucide="user"></i></div>
          <div class="user-meta">
            <b id="topUserName">admin</b>
            <span id="topUserRole">Administrator</span>
            <button class="pbtn-logout" id="btnLogout" title="Sign out">
              <i data-lucide="log-out" style="width:11px;height:11px"></i> <span data-i18n="logout">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div id="ctl">
      <div class="tabs" id="tabs">
        <button class="tab on" data-p="p1"><i data-lucide="layout-dashboard"></i><span data-i18n="tab1">Overview</span></button>
        <button class="tab" data-p="p2"><i data-lucide="snowflake"></i><span data-i18n="tab2">Chiller Plant</span></button>
        <button class="tab" data-p="p3"><i data-lucide="server"></i><span data-i18n="tab3">CRAH &amp; Zones</span></button>
        <button class="tab" data-p="p4"><i data-lucide="zap"></i><span data-i18n="tab4">Power / PV / ESS</span></button>
        <button class="tab" data-p="p5"><i data-lucide="trending-up"></i><span data-i18n="tab5">Trends &amp; Alarms</span></button>
        <button class="tab" data-p="p6" id="tabSettings"><i data-lucide="settings"></i><span data-i18n="tabSettings">Settings</span></button>
      </div>
      <div class="sp"></div>
      <button class="pbtn on" id="btnPlay"><i data-lucide="pause"></i><span data-i18n="pause">Pause</span></button>
      <div class="spd" id="spd">
        <button class="on" data-s="1">1×</button><button data-s="5">5×</button>
        <button data-s="10">10×</button><button data-s="30">30×</button><button data-s="60">60×</button>
      </div>
      <input type="range" id="seek" min="0" max="1439" value="0" step="1">
      <span class="num" id="seekLbl" style="color:var(--ink2);font-size:12px;min-width:46px">00:00</span>
    </div>

    <main>
      <!-- ================= PAGE 1 : OVERVIEW ================= -->
      <section class="page on" id="p1">
        <div class="kpis" id="kpi1" style="margin-bottom:12px"></div>
        <div class="card" style="margin-bottom:12px">
          <h3><span data-i18n="mimicT">Plant Mimic — Building Section</span>
            <span class="r" data-i18n="mimicHint">click a section of the building to open its detail page</span>
          </h3>
          <div id="mimicWrap">
            <div class="mimic-touch-hint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2">
                <path d="M7 16l-5-5 5-5M17 16l5-5-5-5" />
              </svg> <span>เลื่อนซ้าย-ขวาเพื่อดูแผนผัง SCADA ทั้งหมด | Swipe left/right to explore diagram</span></div>
            <svg id="mimic" viewBox="0 0 1560 620" xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#040a14" />
                  <stop offset="1" stop-color="#02050b" />
                </linearGradient>
                <linearGradient id="gRoom" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#061220" />
                  <stop offset="1" stop-color="#040b16" />
                </linearGradient>
                <linearGradient id="gCh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#082240" />
                  <stop offset="1" stop-color="#041224" />
                </linearGradient>
                <linearGradient id="gCrah" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#061d36" />
                  <stop offset="1" stop-color="#030e1c" />
                </linearGradient>
                <linearGradient id="gRack" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#070c14" />
                  <stop offset="1" stop-color="#020408" />
                </linearGradient>
                <linearGradient id="gPlenum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#030712" />
                  <stop offset="1" stop-color="#010308" />
                </linearGradient>
                <marker id="mCold" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
                  <path d="M0,0.6 L7.5,4.5 L0,8.4 z" fill="#38bdf8" />
                </marker>
                <marker id="mHot" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
                  <path d="M0,0.6 L7.5,4.5 L0,8.4 z" fill="#fb923c" />
                </marker>
              </defs>
              <rect x="0" y="0" width="1560" height="620" fill="url(#gSky)" />
              <rect x="0" y="562" width="1560" height="58" fill="#0a1523" />
              <line x1="0" y1="562" x2="1560" y2="562" stroke="#1d3550" stroke-width="1.5" />
              <rect x="40" y="118" width="1480" height="444" fill="url(#gRoom)" stroke="#27476b" stroke-width="1.5"
                rx="3" />
              <rect x="32" y="106" width="1496" height="12" fill="#15263c" stroke="#27476b" stroke-width="1" />
              <line x1="470" y1="118" x2="470" y2="562" stroke="#27476b" stroke-width="1.2" stroke-dasharray="6 5" />
              <line x1="640" y1="118" x2="640" y2="562" stroke="#27476b" stroke-width="1.2" stroke-dasharray="6 5" />
              <text class="lbltag" x="255" y="136" text-anchor="middle" letter-spacing="1.1">CHILLER PLANT ROOM</text>
              <text class="lbltag" x="555" y="136" text-anchor="middle" letter-spacing="1.1">MDB / CONTROL</text>
              <text class="lbltag" x="1080" y="136" text-anchor="middle" letter-spacing="1.1">IT DATA HALL — 4
                ZONES</text>
              <g id="gCTs">
                <text class="lbl" x="60" y="22" font-weight="700" fill="#93aeca">COOLING TOWERS CT-01…06</text>
                <g id="ct1">
                  <rect x="60" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="64" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="64" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="64" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="88" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan1" transform="translate(88,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="88" y="106" text-anchor="middle">CT-01</text>
                </g>
                <g id="ct2">
                  <rect x="128" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="132" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="132" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="132" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="156" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan2" transform="translate(156,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="156" y="106" text-anchor="middle">CT-02</text>
                </g>
                <g id="ct3">
                  <rect x="196" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="200" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="200" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="200" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="224" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan3" transform="translate(224,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="224" y="106" text-anchor="middle">CT-03</text>
                </g>
                <g id="ct4">
                  <rect x="264" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="268" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="268" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="268" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="292" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan4" transform="translate(292,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="292" y="106" text-anchor="middle">CT-04</text>
                </g>
                <g id="ct5">
                  <rect x="332" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="336" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="336" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="336" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="360" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan5" transform="translate(360,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="360" y="106" text-anchor="middle">CT-05</text>
                </g>
                <g id="ct6">
                  <rect x="400" y="36" width="56" height="56" rx="4" fill="#08182b" stroke="#15365c"
                    stroke-width="1.2" />
                  <rect x="404" y="66" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="404" y="74" width="48" height="4" rx="2" fill="#0d2642" />
                  <rect x="404" y="82" width="48" height="4" rx="2" fill="#0d2642" />
                  <circle cx="428" cy="52" r="13" fill="#0c2233" stroke="#2f5b80" stroke-width="1.4" />
                  <g id="ctFan6" transform="translate(428,52)">
                    <path d="M0,-11 L4,-2 L-4,-2 Z" fill="#2f7fa8" />
                    <path d="M9.5,5.5 L1,3 L5,-4 Z" fill="#2f7fa8" />
                    <path d="M-9.5,5.5 L-5,-4 L-1,3 Z" fill="#2f7fa8" />
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.6s"
                      repeatCount="indefinite" additive="sum" />
                  </g>
                  <text class="lbltag" x="428" y="106" text-anchor="middle">CT-06</text>
                </g>
                <text class="lblv" id="mCTfan" x="540" y="46" text-anchor="middle">–</text>
                <text class="lbl" id="mCTfanK" x="540" y="62" text-anchor="middle">fan speed</text>
                <text class="lblv" id="mWB" x="680" y="46" text-anchor="middle">–</text>
                <text class="lbl" id="mWBk" x="680" y="62" text-anchor="middle">wet bulb</text>
                <text class="lblv" id="mAmb" x="830" y="46" text-anchor="middle">–</text>
                <text class="lbl" id="mAmbk" x="830" y="62" text-anchor="middle">ambient / RH</text>
              </g>
              <path class="flow" d="M88 96 L50 96 L50 310 L108 310 L108 360" fill="none" stroke="#34d399"
                stroke-width="3.2" stroke-linecap="round" opacity=".9" />
              <path class="flow" d="M404 360 L404 310 L416 310 L416 96 L428 96" fill="none" stroke="#1f8f6b"
                stroke-width="3.2" stroke-linecap="round" opacity=".8" />
              <text class="lbltag" x="42" y="200" transform="rotate(-90 42 200)" text-anchor="middle" fill="#34d399"
                data-i18n="lblCDW">CDW Condenser Water</text>
              <g id="gChillers" class="hot" data-nav="p2">
                <rect class="hitbox" x="48" y="292" width="414" height="258" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <g id="chG1">
                  <rect id="chBox1" x="60" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="65" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed1" cx="86" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="86" y="416" text-anchor="middle">CH-01</text>
                  <text class="lbltag" id="chPct1" x="86" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <g id="chG2">
                  <rect id="chBox2" x="120" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="125" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed2" cx="146" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="146" y="416" text-anchor="middle">CH-02</text>
                  <text class="lbltag" id="chPct2" x="146" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <g id="chG3">
                  <rect id="chBox3" x="180" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="185" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed3" cx="206" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="206" y="416" text-anchor="middle">CH-03</text>
                  <text class="lbltag" id="chPct3" x="206" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <g id="chG4">
                  <rect id="chBox4" x="240" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="245" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed4" cx="266" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="266" y="416" text-anchor="middle">CH-04</text>
                  <text class="lbltag" id="chPct4" x="266" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <g id="chG5">
                  <rect id="chBox5" x="300" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="305" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed5" cx="326" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="326" y="416" text-anchor="middle">CH-05</text>
                  <text class="lbltag" id="chPct5" x="326" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <g id="chG6">
                  <rect id="chBox6" x="360" y="360" width="52" height="62" rx="4" fill="url(#gCh)" stroke="#2f5b80"
                    stroke-width="1.2" />
                  <rect x="365" y="372" width="42" height="8" rx="3" fill="#0d2c3f" />
                  <circle id="chLed6" cx="386" cy="396" r="5" fill="#4a5f77" />
                  <text class="lbltag" x="386" y="416" text-anchor="middle">CH-06</text>
                  <text class="lbltag" id="chPct6" x="386" y="438" text-anchor="middle" fill="#93aeca">–</text>
                </g>
                <circle id="pmp1" cx="86" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M86 459 L92 466 L86 473 Z" fill="#38bdf8" opacity=".85" />
                <circle id="pmp2" cx="146" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M146 459 L152 466 L146 473 Z" fill="#38bdf8" opacity=".85" />
                <circle id="pmp3" cx="206" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M206 459 L212 466 L206 473 Z" fill="#38bdf8" opacity=".85" />
                <circle id="pmp4" cx="266" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M266 459 L272 466 L266 473 Z" fill="#38bdf8" opacity=".85" />
                <circle id="pmp5" cx="326" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M326 459 L332 466 L326 473 Z" fill="#38bdf8" opacity=".85" />
                <circle id="pmp6" cx="386" cy="466" r="11" fill="#123a52" stroke="#2f5b80" stroke-width="1.2" />
                <path d="M386 459 L392 466 L386 473 Z" fill="#38bdf8" opacity=".85" />
                <text class="lbltag" x="60" y="492" fill="#93aeca">CHP-01…06 (CP2000 VFD)</text>
                <text class="lbltag" x="60" y="326" font-weight="700" fill="#93aeca">CHILLERS 6 × 650 RT · 5 duty + 1
                  standby</text>
                <text class="lblv" id="mChKW" x="60" y="348">–</text>
                <rect x="360" y="498" width="94" height="38" rx="6" fill="#0b1726" opacity="0.85" stroke="#1d3550"
                  stroke-width="1" />
                <text class="lblv" id="mKWRT" x="407" y="516" text-anchor="middle">–</text>
                <text class="lbl" id="mKWRTk" x="407" y="530" text-anchor="middle">plant kW/RT</text>
              </g>
              <g id="gTES">
                <rect x="420" y="300" width="34" height="150" rx="16" fill="#123045" stroke="#2f5b80"
                  stroke-width="1.2" />
                <rect id="tesFill" x="422" y="330" width="30" height="118" rx="14" fill="#1c5f86" opacity=".85" />
                <text class="lbltag" x="437" y="375" text-anchor="middle" font-weight="700">TES</text>
                <text class="lbltag" id="mTES" x="437" y="292" text-anchor="middle" fill="#38bdf8">–</text>
              </g>
              <path class="flow" d="M400 360 L400 168 L1500 168" fill="none" stroke="#00c0f3" stroke-width="4"
                stroke-linecap="round" />
              <path class="flow slow" d="M1500 196 L415 196 L415 360" fill="none" stroke="#f87171" stroke-width="4"
                stroke-linecap="round" />
              <text class="lbltag" x="680" y="159" fill="#38bdf8">CHWS</text>
              <text class="lblv" id="mCHWS" x="726" y="161" fill="#7dd3fc">–</text>
              <text class="lbltag" x="880" y="159" fill="#93aeca">ΔT</text>
              <text class="lblv" id="mDT" x="908" y="161" fill="#e8f1fb">–</text>
              <text class="lbltag" x="1060" y="159" fill="#93aeca">FLOW</text>
              <text class="lblv" id="mFlow" x="1108" y="161" fill="#e8f1fb">–</text>
              <text class="lbltag" x="680" y="214" fill="#f87171">CHWR</text>
              <text class="lblv" id="mCHWR" x="728" y="216" fill="#fca5a5">–</text>
              <g id="gElec" class="hot" data-nav="p4">
                <rect class="hitbox" x="478" y="300" width="154" height="250" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <rect x="492" y="330" width="42" height="120" rx="4" fill="#3c2f14" stroke="#7a5c1e"
                  stroke-width="1.2" />
                <text class="lbltag" x="513" y="466" text-anchor="middle">MDB</text>
                <rect x="546" y="330" width="38" height="90" rx="4" fill="#3a2a12" stroke="#7a5c1e"
                  stroke-width="1.2" />
                <text class="lbltag" x="565" y="434" text-anchor="middle">PLC</text>
                <text class="lbltag" x="565" y="446" text-anchor="middle" fill="#5f7b99">AH500</text>
                <rect x="596" y="360" width="36" height="60" rx="4" fill="#12313a" stroke="#2f7f88"
                  stroke-width="1.2" />
                <text class="lbltag" x="614" y="434" text-anchor="middle">VTScada</text>
                <circle id="plcLed" cx="565" cy="344" r="4.5" fill="#22c55e" />
                <text class="lblv" id="mTot" x="556" y="495" text-anchor="middle">–</text>
                <text class="lbl" x="556" y="510" text-anchor="middle" id="mTotK">total power</text>
                <text class="lblv" id="mPUE" x="556" y="532" text-anchor="middle" fill="#22d3ee">–</text>
              </g>
              <g id="zone1" class="hot" data-nav="p3" data-zone="1">
                <rect class="hitbox" x="644" y="222" width="212" height="330" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <text class="lbl" x="750.0" y="238" text-anchor="middle" font-weight="700" fill="#93aeca">ZONE Z1</text>
                <rect x="706" y="246" width="88" height="58" rx="6" fill="#0c1a2b" opacity="0.88" stroke="#1e3857"
                  stroke-width="1" />
                <rect x="654" y="328" width="52" height="180" rx="4" fill="url(#gCrah)" stroke="#2f7f88"
                  stroke-width="1.2" />
                <rect x="660" y="342" width="40" height="58" rx="3" fill="#0a3b45" stroke="#12525f" />
                <line x1="663" y1="346" x2="663" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="671" y1="346" x2="671" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="679" y1="346" x2="679" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="687" y1="346" x2="687" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="695" y1="346" x2="695" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <circle cx="680" cy="448" r="15" fill="#08303a" stroke="#2aa3b0" stroke-width="1.3" />
                <g transform="translate(680,448)">
                  <path d="M0,-12 L4,-2 L-4,-2 Z" fill="#22d3ee" />
                  <path d="M10.4,6 L1,3 L5.5,-4.5 Z" fill="#22d3ee" />
                  <path d="M-10.4,6 L-5.5,-4.5 L-1,3 Z" fill="#22d3ee" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s"
                    repeatCount="indefinite" additive="sum" />
                </g>
                <text class="lbltag" x="680" y="524" text-anchor="middle">CRAH-Z1</text>
                <path class="flow" d="M680 168 L680 328" fill="none" stroke="#00c0f3" stroke-width="2.6"
                  stroke-linecap="round" />
                <path class="flow slow" d="M716 348 L716 196" fill="none" stroke="#f87171" stroke-width="2.6"
                  stroke-linecap="round" />
                <path d="M674 316 l12 0 l-12 10 l12 -10 l0 10 l-12 -10 z" fill="none" stroke="#facc15"
                  stroke-width="1.6" />
                <text class="lbltag" id="mVlv1" x="692" y="326" fill="#facc15">–</text>
                <rect x="740" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="745" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="745" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="749" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="796" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="801" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="801" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="805" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="784" y="340" width="12" height="160" fill="#7c2d12" opacity=".22" stroke="#fb923c"
                  stroke-width="1" stroke-dasharray="4 3" />
                <path class="flow" d="M790 356 L790 318 L722 318 L722 332" fill="none" stroke="#fb923c" stroke-width="3"
                  stroke-linecap="round" opacity=".9" />
                <path class="flow" d="M680 508 L680 534" fill="none" stroke="#00c0f3" stroke-width="3"
                  stroke-linecap="round" />
                <g id="dmpG1">
                  <rect x="706" y="512" width="10" height="34" rx="2" fill="#2b1a4a" stroke="#9085e9"
                    stroke-width="1.2" />
                  <line id="dmpBlade1" x1="711" y1="516" x2="711" y2="542" stroke="#c4b5fd" stroke-width="2.4"
                    transform="rotate(0 711 529)" />
                </g>
                <text class="lbltag" id="mDmp1" x="724" y="534" fill="#c4b5fd">–</text>
                <rect x="644" y="500" width="212" height="10" fill="#16283d" stroke="#27476b" stroke-width="1" />
                <rect x="644" y="510" width="212" height="38" fill="url(#gPlenum)" />
                <rect x="730" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M742 508 L742 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <rect x="786" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M798 508 L798 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <text class="lblv" id="mZkw1" x="750.0" y="264" text-anchor="middle">–</text>
                <text class="lbltag" x="750.0" y="277" text-anchor="middle" fill="#5f7b99">IT load · inlet</text>
                <text class="lblv" id="mZt1" x="750.0" y="294" text-anchor="middle" fill="#7dd3fc">–</text>
              </g>
              <g id="zone2" class="hot" data-nav="p3" data-zone="2">
                <rect class="hitbox" x="864" y="222" width="212" height="330" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <text class="lbl" x="970.0" y="238" text-anchor="middle" font-weight="700" fill="#93aeca">ZONE Z2</text>
                <rect x="926" y="246" width="88" height="58" rx="6" fill="#0c1a2b" opacity="0.88" stroke="#1e3857"
                  stroke-width="1" />
                <rect x="874" y="328" width="52" height="180" rx="4" fill="url(#gCrah)" stroke="#2f7f88"
                  stroke-width="1.2" />
                <rect x="880" y="342" width="40" height="58" rx="3" fill="#0a3b45" stroke="#12525f" />
                <line x1="883" y1="346" x2="883" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="891" y1="346" x2="891" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="899" y1="346" x2="899" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="907" y1="346" x2="907" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="915" y1="346" x2="915" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <circle cx="900" cy="448" r="15" fill="#08303a" stroke="#2aa3b0" stroke-width="1.3" />
                <g transform="translate(900,448)">
                  <path d="M0,-12 L4,-2 L-4,-2 Z" fill="#22d3ee" />
                  <path d="M10.4,6 L1,3 L5.5,-4.5 Z" fill="#22d3ee" />
                  <path d="M-10.4,6 L-5.5,-4.5 L-1,3 Z" fill="#22d3ee" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s"
                    repeatCount="indefinite" additive="sum" />
                </g>
                <text class="lbltag" x="900" y="524" text-anchor="middle">CRAH-Z2</text>
                <path class="flow" d="M900 168 L900 328" fill="none" stroke="#00c0f3" stroke-width="2.6"
                  stroke-linecap="round" />
                <path class="flow slow" d="M936 348 L936 196" fill="none" stroke="#f87171" stroke-width="2.6"
                  stroke-linecap="round" />
                <path d="M894 316 l12 0 l-12 10 l12 -10 l0 10 l-12 -10 z" fill="none" stroke="#facc15"
                  stroke-width="1.6" />
                <text class="lbltag" id="mVlv2" x="912" y="326" fill="#facc15">–</text>
                <rect x="960" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="965" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="965" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="969" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1016" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="1021" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1021" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1025" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1004" y="340" width="12" height="160" fill="#7c2d12" opacity=".22" stroke="#fb923c"
                  stroke-width="1" stroke-dasharray="4 3" />
                <path class="flow" d="M1010 356 L1010 318 L942 318 L942 332" fill="none" stroke="#fb923c"
                  stroke-width="3" stroke-linecap="round" opacity=".9" />
                <path class="flow" d="M900 508 L900 534" fill="none" stroke="#00c0f3" stroke-width="3"
                  stroke-linecap="round" />
                <g id="dmpG2">
                  <rect x="926" y="512" width="10" height="34" rx="2" fill="#2b1a4a" stroke="#9085e9"
                    stroke-width="1.2" />
                  <line id="dmpBlade2" x1="931" y1="516" x2="931" y2="542" stroke="#c4b5fd" stroke-width="2.4"
                    transform="rotate(0 931 529)" />
                </g>
                <text class="lbltag" id="mDmp2" x="944" y="534" fill="#c4b5fd">–</text>
                <rect x="864" y="500" width="212" height="10" fill="#16283d" stroke="#27476b" stroke-width="1" />
                <rect x="864" y="510" width="212" height="38" fill="url(#gPlenum)" />
                <rect x="950" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M962 508 L962 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <rect x="1006" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M1018 508 L1018 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <text class="lblv" id="mZkw2" x="970.0" y="264" text-anchor="middle">–</text>
                <text class="lbltag" x="970.0" y="277" text-anchor="middle" fill="#5f7b99">IT load · inlet</text>
                <text class="lblv" id="mZt2" x="970.0" y="294" text-anchor="middle" fill="#7dd3fc">–</text>
              </g>
              <g id="zone3" class="hot" data-nav="p3" data-zone="3">
                <rect class="hitbox" x="1084" y="222" width="212" height="330" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <text class="lbl" x="1190.0" y="238" text-anchor="middle" font-weight="700" fill="#93aeca">ZONE
                  Z3</text>
                <rect x="1146" y="246" width="88" height="58" rx="6" fill="#0c1a2b" opacity="0.88" stroke="#1e3857"
                  stroke-width="1" />
                <rect x="1094" y="328" width="52" height="180" rx="4" fill="url(#gCrah)" stroke="#2f7f88"
                  stroke-width="1.2" />
                <rect x="1100" y="342" width="40" height="58" rx="3" fill="#0a3b45" stroke="#12525f" />
                <line x1="1103" y1="346" x2="1103" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1111" y1="346" x2="1111" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1119" y1="346" x2="1119" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1127" y1="346" x2="1127" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1135" y1="346" x2="1135" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <circle cx="1120" cy="448" r="15" fill="#08303a" stroke="#2aa3b0" stroke-width="1.3" />
                <g transform="translate(1120,448)">
                  <path d="M0,-12 L4,-2 L-4,-2 Z" fill="#22d3ee" />
                  <path d="M10.4,6 L1,3 L5.5,-4.5 Z" fill="#22d3ee" />
                  <path d="M-10.4,6 L-5.5,-4.5 L-1,3 Z" fill="#22d3ee" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s"
                    repeatCount="indefinite" additive="sum" />
                </g>
                <text class="lbltag" x="1120" y="524" text-anchor="middle">CRAH-Z3</text>
                <path class="flow" d="M1120 168 L1120 328" fill="none" stroke="#00c0f3" stroke-width="2.6"
                  stroke-linecap="round" />
                <path class="flow slow" d="M1156 348 L1156 196" fill="none" stroke="#f87171" stroke-width="2.6"
                  stroke-linecap="round" />
                <path d="M1114 316 l12 0 l-12 10 l12 -10 l0 10 l-12 -10 z" fill="none" stroke="#facc15"
                  stroke-width="1.6" />
                <text class="lbltag" id="mVlv3" x="1132" y="326" fill="#facc15">–</text>
                <rect x="1180" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="1185" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1185" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1189" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1236" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="1241" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1241" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1245" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1224" y="340" width="12" height="160" fill="#7c2d12" opacity=".22" stroke="#fb923c"
                  stroke-width="1" stroke-dasharray="4 3" />
                <path class="flow" d="M1230 356 L1230 318 L1162 318 L1162 332" fill="none" stroke="#fb923c"
                  stroke-width="3" stroke-linecap="round" opacity=".9" />
                <path class="flow" d="M1120 508 L1120 534" fill="none" stroke="#00c0f3" stroke-width="3"
                  stroke-linecap="round" />
                <g id="dmpG3">
                  <rect x="1146" y="512" width="10" height="34" rx="2" fill="#2b1a4a" stroke="#9085e9"
                    stroke-width="1.2" />
                  <line id="dmpBlade3" x1="1151" y1="516" x2="1151" y2="542" stroke="#c4b5fd" stroke-width="2.4"
                    transform="rotate(0 1151 529)" />
                </g>
                <text class="lbltag" id="mDmp3" x="1164" y="534" fill="#c4b5fd">–</text>
                <rect x="1084" y="500" width="212" height="10" fill="#16283d" stroke="#27476b" stroke-width="1" />
                <rect x="1084" y="510" width="212" height="38" fill="url(#gPlenum)" />
                <rect x="1170" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M1182 508 L1182 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <rect x="1226" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M1238 508 L1238 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <text class="lblv" id="mZkw3" x="1190.0" y="264" text-anchor="middle">–</text>
                <text class="lbltag" x="1190.0" y="277" text-anchor="middle" fill="#5f7b99">IT load · inlet</text>
                <text class="lblv" id="mZt3" x="1190.0" y="294" text-anchor="middle" fill="#7dd3fc">–</text>
              </g>
              <g id="zone4" class="hot" data-nav="p3" data-zone="4">
                <rect class="hitbox" x="1304" y="222" width="212" height="330" rx="8" fill="transparent"
                  stroke="transparent" stroke-width="1.5" />
                <text class="lbl" x="1410.0" y="238" text-anchor="middle" font-weight="700" fill="#93aeca">ZONE
                  Z4</text>
                <rect x="1366" y="246" width="88" height="58" rx="6" fill="#0c1a2b" opacity="0.88" stroke="#1e3857"
                  stroke-width="1" />
                <rect x="1314" y="328" width="52" height="180" rx="4" fill="url(#gCrah)" stroke="#2f7f88"
                  stroke-width="1.2" />
                <rect x="1320" y="342" width="40" height="58" rx="3" fill="#0a3b45" stroke="#12525f" />
                <line x1="1323" y1="346" x2="1323" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1331" y1="346" x2="1331" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1339" y1="346" x2="1339" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1347" y1="346" x2="1347" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <line x1="1355" y1="346" x2="1355" y2="396" stroke="#2aa3b0" stroke-width="1.4" opacity=".8" />
                <circle cx="1340" cy="448" r="15" fill="#08303a" stroke="#2aa3b0" stroke-width="1.3" />
                <g transform="translate(1340,448)">
                  <path d="M0,-12 L4,-2 L-4,-2 Z" fill="#22d3ee" />
                  <path d="M10.4,6 L1,3 L5.5,-4.5 Z" fill="#22d3ee" />
                  <path d="M-10.4,6 L-5.5,-4.5 L-1,3 Z" fill="#22d3ee" />
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s"
                    repeatCount="indefinite" additive="sum" />
                </g>
                <text class="lbltag" x="1340" y="524" text-anchor="middle">CRAH-Z4</text>
                <path class="flow" d="M1340 168 L1340 328" fill="none" stroke="#00c0f3" stroke-width="2.6"
                  stroke-linecap="round" />
                <path class="flow slow" d="M1376 348 L1376 196" fill="none" stroke="#f87171" stroke-width="2.6"
                  stroke-linecap="round" />
                <path d="M1334 316 l12 0 l-12 10 l12 -10 l0 10 l-12 -10 z" fill="none" stroke="#facc15"
                  stroke-width="1.6" />
                <text class="lbltag" id="mVlv4" x="1352" y="326" fill="#facc15">–</text>
                <rect x="1400" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="1405" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1405" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1409" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1456" y="360" width="44" height="140" rx="3" fill="url(#gRack)" stroke="#3b5372"
                  stroke-width="1.1" />
                <rect x="1461" y="368" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="374" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="387" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="393" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="406" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="412" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="425" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="431" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="444" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="450" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="463" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="469" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1461" y="482" width="34" height="12" rx="2" fill="#0f1b2b" />
                <circle cx="1465" cy="488" r="1.8" fill="#22d3ee" opacity=".8" />
                <rect x="1444" y="340" width="12" height="160" fill="#7c2d12" opacity=".22" stroke="#fb923c"
                  stroke-width="1" stroke-dasharray="4 3" />
                <path class="flow" d="M1450 356 L1450 318 L1382 318 L1382 332" fill="none" stroke="#fb923c"
                  stroke-width="3" stroke-linecap="round" opacity=".9" />
                <path class="flow" d="M1340 508 L1340 534" fill="none" stroke="#00c0f3" stroke-width="3"
                  stroke-linecap="round" />
                <g id="dmpG4">
                  <rect x="1366" y="512" width="10" height="34" rx="2" fill="#2b1a4a" stroke="#9085e9"
                    stroke-width="1.2" />
                  <line id="dmpBlade4" x1="1371" y1="516" x2="1371" y2="542" stroke="#c4b5fd" stroke-width="2.4"
                    transform="rotate(0 1371 529)" />
                </g>
                <text class="lbltag" id="mDmp4" x="1384" y="534" fill="#c4b5fd">–</text>
                <rect x="1304" y="500" width="212" height="10" fill="#16283d" stroke="#27476b" stroke-width="1" />
                <rect x="1304" y="510" width="212" height="38" fill="url(#gPlenum)" />
                <rect x="1390" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M1402 508 L1402 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <rect x="1446" y="500" width="24" height="10" fill="#0e4a63" stroke="#00c0f3" stroke-width="1" />
                <path class="flow" d="M1458 508 L1458 352" fill="none" stroke="#00c0f3" stroke-width="2.2"
                  stroke-linecap="round" opacity=".75" marker-end="url(#mCold)" />
                <text class="lblv" id="mZkw4" x="1410.0" y="264" text-anchor="middle">–</text>
                <text class="lbltag" x="1410.0" y="277" text-anchor="middle" fill="#5f7b99">IT load · inlet</text>
                <text class="lblv" id="mZt4" x="1410.0" y="294" text-anchor="middle" fill="#7dd3fc">–</text>
              </g>
              <line x1="860" y1="304" x2="860" y2="548" stroke="#1d3550" stroke-width="1" stroke-dasharray="4 6" />
              <line x1="1080" y1="304" x2="1080" y2="548" stroke="#1d3550" stroke-width="1" stroke-dasharray="4 6" />
              <line x1="1300" y1="304" x2="1300" y2="548" stroke="#1d3550" stroke-width="1" stroke-dasharray="4 6" />
              <path d="M565 424 L565 542 L1500 542" fill="none" stroke="#9085e9" stroke-width="1.6"
                stroke-dasharray="7 6" opacity=".75" />
              <text class="lbltag" x="1180" y="552" fill="#9085e9" data-i18n="lblModbus">Modbus TCP — PLC ↔ VFD /
                Sensors / Power Meters</text>
              <path d="M470 400 L400 400" fill="none" stroke="#9085e9" stroke-width="1.6" stroke-dasharray="7 6"
                opacity=".75" />
              <g id="mimicLegend">
                <rect x="60" y="596" width="16" height="3.5" rx="2" fill="#38bdf8" />
                <text class="lbltag" x="82" y="600" data-i18n="legCHWS">CHWS / Cold Air</text>
                <rect x="200" y="596" width="16" height="3.5" rx="2" fill="#f87171" />
                <text class="lbltag" x="222" y="600" data-i18n="legCHWR">CHWR / Return Water</text>
                <rect x="340" y="596" width="16" height="3.5" rx="2" fill="#34d399" />
                <text class="lbltag" x="362" y="600" data-i18n="legCDW">CDW Condenser Water</text>
                <rect x="500" y="596" width="16" height="3.5" rx="2" fill="#fb923c" />
                <text class="lbltag" x="522" y="600" data-i18n="legHotAir">Hot Air</text>
                <rect x="600" y="596" width="16" height="3.5" rx="2" fill="#9085e9" />
                <text class="lbltag" x="622" y="600" data-i18n="legCtrl">Control Line</text>
              </g>
              <text class="lbltag" x="1500" y="600" text-anchor="end" fill="#5f7b99"
                id="mimicHint">คลิกที่ส่วนของอาคารเพื่อดูรายละเอียด</text>
            </svg>
          </div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
          <div class="card">
            <h3><span data-i18n="c1a">Power — 24 h Profile</span><span class="r num" id="r1a"></span><button
                type="button" class="btn-chart-fs" onclick="openChartFsModal('cvOv1')" title="Full Screen"><svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvOv1" height="200"></canvas></div>
            <div class="legend" id="lgOv1"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c1b">Cooling Efficiency — PUE &amp; kW/RT</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvOv2')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvOv2" height="200"></canvas></div>
            <div class="legend" id="lgOv2"></div>
          </div>
        </div>
      </section>

      <!-- ================= PAGE 2 : CHILLER PLANT ================= -->
      <section class="page" id="p2">
        <div class="card" style="margin-bottom:12px">
          <h3><span data-i18n="c2g">Chilled-Water Plant — Live Values</span></h3>
          <div class="pad gauges" id="g2"></div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr));margin-bottom:12px">
          <div class="card">
            <h3><span data-i18n="c2a">Chiller Staging</span><span class="r" id="r2a"></span></h3>
            <div class="table-responsive">
              <table class="eqtable" id="tbCh"></table>
            </div>
            <div class="note" data-i18n="n2a"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c2b">Pumps, Cooling Towers &amp; Condenser Loop</span></h3>
            <div class="table-responsive">
              <table class="eqtable" id="tbAux"></table>
            </div>
          </div>
          <div class="card">
            <h3><span data-i18n="c2c">Cooling Power Breakdown</span><span class="r num" id="r2c"></span></h3>
            <div class="pad" id="brk"></div>
          </div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
          <div class="card">
            <h3><span data-i18n="c2d">Chilled &amp; Condenser Water Temperatures</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvCh1')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvCh1" height="200"></canvas></div>
            <div class="legend" id="lgCh1"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c2e">Cooling Electrical Load by Sub-System</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvCh2')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvCh2" height="200"></canvas></div>
            <div class="legend" id="lgCh2"></div>
          </div>
        </div>
      </section>

      <!-- ================= PAGE 3 : CRAH & ZONES ================= -->
      <section class="page" id="p3">
        <div class="zgrid" id="zoneCards" style="margin-bottom:12px"></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
          <div class="card">
            <h3><span data-i18n="c3a">Zone Load vs Damper Position</span><button type="button" class="btn-chart-fs"
                onclick="openChartFsModal('cvZ1')" title="Full Screen"><svg width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvZ1" height="210"></canvas></div>
            <div class="legend" id="lgZ1"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c3b">Rack Inlet Temperature — 24 h</span><span class="r" data-i18n="ashrae">ASHRAE A1
                allowable 18–27 °C</span><button type="button" class="btn-chart-fs" onclick="openChartFsModal('cvZ2')"
                title="Full Screen"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvZ2" height="210"></canvas></div>
            <div class="legend" id="lgZ2"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c3c">CRAH Units</span></h3>
            <div class="table-responsive">
              <table class="eqtable" id="tbCrah"></table>
            </div>
            <div class="note" data-i18n="n3a"></div>
          </div>
        </div>
      </section>

      <!-- ================= PAGE 4 : POWER / PV / ESS ================= -->
      <section class="page" id="p4">
        <div class="kpis" id="kpi4" style="margin-bottom:12px"></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));margin-bottom:12px">
          <div class="card">
            <h3><span data-i18n="c4a">Load vs Dynamic Limit — Micro Peak Shaving</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvP1')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvP1" height="215"></canvas></div>
            <div class="legend" id="lgP1"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c4b">PV Generation, ESS &amp; Grid Import</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvP2')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvP2" height="215"></canvas></div>
            <div class="legend" id="lgP2"></div>
          </div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))">
          <div class="card">
            <h3><span data-i18n="c4c">Energy Storage</span><button type="button" class="btn-chart-fs"
                onclick="openChartFsModal('cvSoc')" title="Full Screen"><svg width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="pad gauges" id="g4"></div>
            <div class="chartbox"><canvas id="cvSoc" height="120"></canvas></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c4e">Energy Accumulated Today</span></h3>
            <div class="table-responsive">
              <table class="eqtable" id="tbEn"></table>
            </div>
          </div>
          <div class="card">
            <h3><span data-i18n="c4e">Power Flow Now</span></h3>
            <div class="pad" id="pflow"></div>
          </div>
        </div>
      </section>

      <!-- ================= PAGE 5 : TRENDS & ALARMS ================= -->
      <section class="page" id="p5">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(430px,1fr));margin-bottom:12px">
          <div class="card">
            <h3><span data-i18n="c5a">Predictive Control — Actual vs Predicted Cooling Load</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvT1')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvT1" height="215"></canvas></div>
            <div class="legend" id="lgT1"></div>
            <div class="note" data-i18n="n5a"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c5b">Thermal Load &amp; Chiller Staging</span><button type="button"
                class="btn-chart-fs" onclick="openChartFsModal('cvT2')" title="Full Screen"><svg width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                  stroke-linejoin="round">
                  <path
                    d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg> Full Screen</button></h3>
            <div class="chartbox"><canvas id="cvT2" height="215"></canvas></div>
            <div class="legend" id="lgT2"></div>
          </div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
          <div class="card" style="grid-column:span 2;min-width:0">
            <h3><span data-i18n="c5c">Alarm &amp; Event Log</span><span class="r num" id="r5c"></span></h3>
            <div class="alm-row head">
              <div data-i18n="aTime">Time</div>
              <div data-i18n="aSev">Severity</div>
              <div data-i18n="aMsg">Message</div>
              <div data-i18n="aTag">Tag</div>
            </div>
            <div id="almList"></div>
          </div>
          <div class="card">
            <h3><span data-i18n="c5d">Daily Summary</span></h3>
            <div class="table-responsive">
              <table class="eqtable" id="tbSum"></table>
            </div>
            <div class="note" data-i18n="n5b"></div>
          </div>
        </div>
      </section>

      <!-- ================= PAGE 6 : SETTINGS & DATA CONFIGURATION ================= -->
      <section class="page" id="p6">
        <!-- System Settings Header Card -->
        <div class="card" style="margin-bottom:16px">
          <div class="pad" style="padding:18px 22px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
              <div>
                <h2 style="display:flex;align-items:center;gap:10px;margin:0 0 6px 0;font-size:18px;font-weight:700">
                  <i data-lucide="settings" style="color:var(--accent);width:20px;height:20px"></i>
                  <span data-i18n="settingTitle">System Settings &amp; Dataset Configuration</span>
                </h2>
                <p style="margin:0;font-size:13px;color:var(--ink2)" data-i18n="settingSub">
                  Manage interface display, language, upload custom simulation datasets (CSV), and download active telemetry data
                </p>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <span class="badge b-info" id="cfgRoleBadge">Administrator</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Preferences Grid: Theme & Language -->
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:16px">
          <!-- Card: Appearance / Theme -->
          <div class="card">
            <h3>
              <span data-i18n="settingAppearanceTitle">Display &amp; Appearance</span>
              <span class="r badge b-info" id="currentThemeBadge">Dark Mode</span>
            </h3>
            <div class="pad" style="padding:18px 20px">
              <div style="margin-bottom:14px">
                <label style="display:block;font-size:12px;color:var(--ink2);margin-bottom:8px" data-i18n="settingThemeLabel">Interface Theme</label>
                <div class="setting-btn-group" id="themeButtonGroup">
                  <button type="button" class="setting-pill-btn active" id="btnSetThemeDark">
                    <i data-lucide="moon"></i> <span data-i18n="settingThemeDark">Dark Mode</span>
                  </button>
                  <button type="button" class="setting-pill-btn" id="btnSetThemeLight">
                    <i data-lucide="sun"></i> <span data-i18n="settingThemeLight">Light Mode</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Card: Language -->
          <div class="card">
            <h3>
              <span data-i18n="settingLangLabel">Language</span>
              <span class="r badge b-ok" id="currentLangBadge">ไทย (TH)</span>
            </h3>
            <div class="pad" style="padding:18px 20px">
              <div style="margin-bottom:14px">
                <label style="display:block;font-size:12px;color:var(--ink2);margin-bottom:8px" data-i18n="settingLangLabel">Language Selection</label>
                <div class="setting-btn-group" id="langButtonGroup">
                  <button type="button" class="setting-pill-btn active" id="btnSetLangTh">
                    <span style="font-size:14px">🇹🇭</span> <span>ภาษาไทย (TH)</span>
                  </button>
                  <button type="button" class="setting-pill-btn" id="btnSetLangEn">
                    <span style="font-size:14px">🇬🇧</span> <span>English (EN)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Simulation Dataset Control (Upload & Download CSV) -->
        <div class="card" style="margin-bottom:16px">
          <h3>
            <span data-i18n="settingDatasetTitle">Simulation Dataset Management</span>
            <span class="r num" style="font-size:12px;color:var(--ink2)" data-i18n="settingDatasetSub">
              Upload a CSV dataset to simulate plant behavior or download active telemetry data
            </span>
          </h3>
          <div class="pad" style="padding:20px">
            <!-- Dataset Status Banner -->
            <div class="dataset-status-bar">
              <div class="dataset-meta-item">
                <span class="lbl" data-i18n="settingActiveDataset">Active Dataset:</span>
                <span class="val" id="activeDatasetName"><i data-lucide="database" style="width:13px;height:13px;color:var(--accent)"></i> 2026-08-09 (Built-in Default)</span>
              </div>
              <div class="dataset-meta-item">
                <span class="lbl" data-i18n="settingActivePoints">Data Resolution:</span>
                <span class="val num" id="activeDatasetCount">1,440 Points (24h · 1-min)</span>
              </div>
              <div class="dataset-meta-item">
                <span class="lbl">Status:</span>
                <span class="badge b-ok" id="activeDatasetStatusBadge"><i></i> Ready &amp; In-Sync</span>
              </div>
            </div>

            <!-- Feedback notification alert (hidden by default) -->
            <div id="csvFeedbackBox" class="csv-feedback-alert" style="display:none;margin-bottom:16px">
              <div class="csv-feedback-icon" id="csvFeedbackIcon"><i data-lucide="check-circle-2"></i></div>
              <div class="csv-feedback-msg" id="csvFeedbackMsg"></div>
            </div>

            <!-- Two columns: Download and Upload -->
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">
              <!-- Left: Download Actions -->
              <div class="dataset-action-box">
                <h4 style="margin:0 0 8px 0;font-size:14px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="download" style="color:var(--cold);width:16px;height:16px"></i>
                  <span data-i18n="settingDownloadTitle">Export / Download Data</span>
                </h4>
                <p style="font-size:12px;color:var(--ink2);margin:0 0 16px 0;line-height:1.55">
                  Download the currently active 24-hour simulation telemetry series (1,440 data points) as a CSV spreadsheet, or get a clean blank template for preparing your own data.
                </p>
                <div style="display:flex;flex-wrap:wrap;gap:10px">
                  <button type="button" class="pbtn on" id="btnDownloadActiveCsv">
                    <i data-lucide="download"></i>
                    <span data-i18n="settingBtnDownloadActive">Download Active CSV</span>
                  </button>
                  <button type="button" class="pbtn" id="btnDownloadTemplateCsv">
                    <i data-lucide="file-spreadsheet"></i>
                    <span data-i18n="settingBtnDownloadTpl">Download CSV Template</span>
                  </button>
                </div>
              </div>

              <!-- Right: Upload Actions -->
              <div class="dataset-action-box">
                <h4 style="margin:0 0 8px 0;font-size:14px;display:flex;align-items:center;gap:6px">
                  <i data-lucide="upload-cloud" style="color:var(--accent);width:16px;height:16px"></i>
                  <span data-i18n="settingUploadTitle">Import / Upload Custom CSV</span>
                </h4>
                <input type="file" id="csvFileInput" accept=".csv,text/csv" style="display:none">
                <div class="csv-drop-zone" id="csvDropZone">
                  <i data-lucide="file-up" class="drop-icon"></i>
                  <div class="drop-text" data-i18n="settingDropHint">Drag and drop your simulation CSV file here, or click to browse</div>
                  <div class="drop-sub" data-i18n="settingDropSub">Supports 24-hr 1-minute interval time series (1,440 points)</div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:14px">
                  <button type="button" class="pbtn on" id="btnBrowseCsv">
                    <i data-lucide="upload"></i>
                    <span data-i18n="settingBtnUpload">Select &amp; Upload CSV</span>
                  </button>
                  <button type="button" class="pbtn" id="btnResetCsv" style="color:var(--ink2)">
                    <i data-lucide="rotate-ccw"></i>
                    <span data-i18n="settingBtnReset">Reset to Default Dataset</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dataset Schema & Column Specification Guide -->
        <div class="card">
          <h3>
            <span data-i18n="settingGuideTitle">Dataset Schema &amp; Column Specification</span>
            <span class="r" style="font-size:12px;color:var(--ink2)" data-i18n="settingGuideSub">
              The CSV file must contain the following telemetry columns for full simulation fidelity
            </span>
            <button type="button" class="btn-eq-ctrl" id="btnCopySampleCsv" style="margin-left:14px">
              <i data-lucide="copy" style="width:12px;height:12px"></i>
              <span data-i18n="settingCopySample">Copy Sample CSV</span>
            </button>
          </h3>
          <div class="pad" style="padding:20px">
            <div class="table-responsive" style="border:1px solid var(--line);border-radius:8px;overflow:auto">
              <table class="eqtable csv-guide-table">
                <thead>
                  <tr>
                    <th style="width:110px" data-i18n="settingColName">Column</th>
                    <th style="width:120px" data-i18n="settingColReq">Required</th>
                    <th style="width:90px" data-i18n="settingColUnit">Unit</th>
                    <th style="width:140px">Expected Range</th>
                    <th data-i18n="settingColDesc">Telemetry Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>time</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>HH:MM</td>
                    <td>00:00 - 23:59</td>
                    <td>เวลาจุดจำลอง (Timestamp รายนาที) หากไม่มีในไฟล์ ระบบจะสร้างลำดับเวลา 00:00 - 23:59 ให้อัตโนมัติ</td>
                  </tr>
                  <tr>
                    <td><code>it</code></td>
                    <td><span class="badge b-alm">Required *</span></td>
                    <td>kW</td>
                    <td>1,800 - 5,000</td>
                    <td>กำลังไฟฟ้าโหลดไอที (IT Equipment Power) เป็นค่าหลักในการจำลองการปล่อยความร้อนและ PUE</td>
                  </tr>
                  <tr>
                    <td><code>cool</code></td>
                    <td><span class="badge b-alm">Required *</span></td>
                    <td>kW</td>
                    <td>800 - 3,000</td>
                    <td>กำลังไฟฟ้ารวมของระบบทำความเย็นทั้งหมด (ชิลเลอร์, ปั๊มน้ำ, หอผึ่งเย็น, พัดลม CRAH)</td>
                  </tr>
                  <tr>
                    <td><code>pit</code></td>
                    <td><span class="badge b-ok">Recommended</span></td>
                    <td>kW</td>
                    <td>1,800 - 5,000</td>
                    <td>ค่าพยากรณ์โหลดไอทีล่วงหน้า (AI Predicted IT Load) สำหรับระบบควบคุมเชิงคาดการณ์</td>
                  </tr>
                  <tr>
                    <td><code>pcool</code></td>
                    <td><span class="badge b-ok">Recommended</span></td>
                    <td>kW</td>
                    <td>800 - 3,000</td>
                    <td>ค่าพยากรณ์กำลังไฟฟ้าทำความเย็นล่วงหน้า (AI Predicted Cooling Power) ใช้ใน Pre-cooling</td>
                  </tr>
                  <tr>
                    <td><code>lim</code></td>
                    <td><span class="badge b-ok">Recommended</span></td>
                    <td>kW</td>
                    <td>0 - 6,000</td>
                    <td>ขีดจำกัดตัดยอดพีคพลวัต (Dynamic Peak Shaving Limit) ใส่ 0 หากไม่อยู่ในช่วงตัดยอดพีค</td>
                  </tr>
                  <tr>
                    <td><code>pv</code></td>
                    <td><span class="badge b-ok">Recommended</span></td>
                    <td>kW</td>
                    <td>0 - 2,500</td>
                    <td>กำลังการผลิตไฟฟ้าจากแผงโซลาร์เซลล์ (Solar PV Power Generation)</td>
                  </tr>
                  <tr>
                    <td><code>pv2l</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>kW</td>
                    <td>0 - 2,500</td>
                    <td>กำลังไฟฟ้าจากโซลาร์เซลล์ที่จ่ายตรงเข้าสู่โหลดไอที (PV to IT Load)</td>
                  </tr>
                  <tr>
                    <td><code>pv2e</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>kW</td>
                    <td>0 - 1,500</td>
                    <td>กำลังไฟฟ้าจากโซลาร์เซลล์ที่นำไปชาร์จเข้าแบตเตอรี่ ESS (PV to Battery ESS)</td>
                  </tr>
                  <tr>
                    <td><code>esd</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>kW</td>
                    <td>0 - 1,500</td>
                    <td>กำลังไฟฟ้าที่จ่ายออกจากแบตเตอรี่ ESS สู่ระบบโรงงาน (ESS Discharge Power)</td>
                  </tr>
                  <tr>
                    <td><code>soc</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>kWh / %</td>
                    <td>0 - 1,000</td>
                    <td>ระดับประจุพลังงานสะสมในแบตเตอรี่ ESS (Battery State of Charge)</td>
                  </tr>
                  <tr>
                    <td><code>grid</code></td>
                    <td><span class="badge b-ok">Recommended</span></td>
                    <td>kW</td>
                    <td>1,000 - 6,500</td>
                    <td>กำลังไฟฟ้าที่รับจากสายส่งการไฟฟ้า (Utility Grid Power) หากไม่มีจะคำนวณจาก it + cool - pv - esd</td>
                  </tr>
                  <tr>
                    <td><code>mode</code></td>
                    <td><span class="badge b-info">Optional</span></td>
                    <td>0 - 3</td>
                    <td>0, 1, 2, 3</td>
                    <td>ดัชนีโหมดควบคุม (0: ปกติ Normal, 1: ตัดยอดพีค Peak Shaving, 2: PV จ่ายโหลด, 3: PV ชาร์จ ESS)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Sample Code Snippet -->
            <div style="margin-top:18px">
              <div style="font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:8px">ตัวอย่างรูปแบบข้อมูลในไฟล์ CSV (3 แถวแรก):</div>
              <pre class="csv-sample-code" id="csvSampleSnippet">time,it,pit,cool,pcool,lim,pv,pv2l,pv2e,esd,soc,grid,mode
00:00,2200.0,2199.5,1189.2,1215.6,0.0,0.0,0.0,0.0,0.0,450.0,3389.2,0
00:01,2200.0,2197.3,1188.8,1215.6,0.0,0.0,0.0,0.0,0.0,450.0,3388.8,0
00:02,2200.0,2230.5,1201.6,1215.6,0.0,0.0,0.0,0.0,0.0,450.0,3401.6,0</pre>
            </div>
          </div>
        </div>
      </section>
    </main>
    <div id="tip"></div>

    <!-- Toast notification container -->
    <div id="toastBox"></div>

    <!-- System Events Audit Log Terminal Dock -->
    <div id="auditDock" class="collapsed">
      <div class="audit-bar" id="auditBar">
        <div class="audit-title">
          <span class="audit-pulse"></span>
          <span data-i18n="auditTitle">System Events</span>
        </div>
        <div class="audit-ticker" id="auditTicker">Live system event monitoring active...</div>
        <div class="audit-tools">
          <span class="badge b-info" id="auditCount">0 Events</span>
          <button class="btn-eq-ctrl" id="btnAuditToggle" style="padding:2px 7px"><i data-lucide="chevron-up" style="width:11px;height:11px"></i> <span
              data-i18n="auditExpand">Expand</span></button>
        </div>
      </div>
      <div class="audit-body" id="auditBody" style="display:none">
        <div class="audit-filters">
          <button class="audit-fbtn on" data-f="ALL" data-i18n="auditFilterAll">All Logs</button>
          <button class="audit-fbtn" data-f="CMD" data-i18n="auditFilterCmd">Commands</button>
          <button class="audit-fbtn" data-f="SEC" data-i18n="auditFilterSec">Security</button>
          <button class="audit-fbtn" data-f="SYS" data-i18n="auditFilterSys">System</button>
          <div style="flex:1"></div>
          <button class="btn-eq-ctrl" id="btnClearAudit" style="color:#f87171;border-color:rgba(239,68,68,0.3)">
            <i data-lucide="trash-2" style="width:12px;height:12px"></i>
            <span data-i18n="auditClear">Clear</span></button>
        </div>
        <div class="audit-list" id="auditList"></div>
      </div>
    </div>

  </div><!-- #scadaApp -->
</template>

