'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const RULES = { besoins: 0.50, envies: 0.30, epargne: 0.20 };

const CATEGORIES = {
  besoins: {
    label: 'Besoins',
    color: '#22d3ee',
    target: 0.50,
    icon: '🏠',
    subcategories: [
      { id: 'loyer',        label: 'Loyer / Hypothèque', icon: '🏠', placeholder: 800 },
      { id: 'alimentation', label: 'Alimentation',        icon: '🛒', placeholder: 300 },
      { id: 'transport',    label: 'Transport',           icon: '🚗', placeholder: 150 },
      { id: 'sante',        label: 'Santé',               icon: '💊', placeholder: 60  },
      { id: 'assurances',   label: 'Assurances',          icon: '🛡️', placeholder: 80  },
      { id: 'factures',     label: 'Factures & Abos',     icon: '💡', placeholder: 100 },
    ]
  },
  envies: {
    label: 'Envies',
    color: '#a78bfa',
    target: 0.30,
    icon: '✨',
    subcategories: [
      { id: 'restaurants',  label: 'Restaurants / Sorties', icon: '🍽️', placeholder: 150 },
      { id: 'loisirs',      label: 'Loisirs',               icon: '🎮', placeholder: 100 },
      { id: 'shopping',     label: 'Shopping',              icon: '👗', placeholder: 100 },
      { id: 'abonnements',  label: 'Abonnements streaming', icon: '📱', placeholder: 50  },
      { id: 'voyages',      label: 'Voyages',               icon: '✈️', placeholder: 100 },
    ]
  },
  epargne: {
    label: 'Épargne',
    color: '#34d399',
    target: 0.20,
    icon: '💰',
    subcategories: [
      { id: 'epargne',         label: 'Épargne',              icon: '🏦', placeholder: 200 },
      { id: 'investissements', label: 'Investissements',      icon: '📈', placeholder: 100 },
      { id: 'dettes',          label: 'Remboursement dettes', icon: '🔄', placeholder: 0   },
    ]
  }
};

const ALL_SUB_IDS = Object.values(CATEGORIES)
  .flatMap(c => c.subcategories.map(s => s.id));

// ─── STATE ────────────────────────────────────────────────────────────────────

let state = {
  income: 0,
  expenses: Object.fromEntries(ALL_SUB_IDS.map(id => [id, 0])),
  currentStep: 'hero',
  activeTab: 'besoins',
};

// ─── CHART INSTANCES ──────────────────────────────────────────────────────────

let donutActualChart = null;
let donutIdealChart  = null;
let barChart         = null;

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

function saveState() {
  localStorage.setItem('kakebo_state', JSON.stringify(state));
}

function loadState() {
  try {
    const saved = localStorage.getItem('kakebo_state');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };
    if (state.income > 0) {
      document.getElementById('income-input').value = state.income;
      document.getElementById('btn-start').disabled = false;
      ALL_SUB_IDS.forEach(id => {
        const el = document.getElementById('expense-' + id);
        if (el && state.expenses[id]) el.value = state.expenses[id] || '';
      });
    }
    if (state.currentStep === 'input' || state.currentStep === 'dashboard') {
      navigateTo(state.currentStep, true);
    }
  } catch(e) { /* ignore corrupted state */ }
}

// ─── CALCULATIONS ─────────────────────────────────────────────────────────────

function getCategoryTotal(cat) {
  return CATEGORIES[cat].subcategories
    .reduce((sum, sub) => sum + (state.expenses[sub.id] || 0), 0);
}

function getAllTotals() {
  const besoins = getCategoryTotal('besoins');
  const envies  = getCategoryTotal('envies');
  const epargne = getCategoryTotal('epargne');
  return { besoins, envies, epargne, total: besoins + envies + epargne };
}

function getIdealBudget() {
  return {
    besoins: state.income * RULES.besoins,
    envies:  state.income * RULES.envies,
    epargne: state.income * RULES.epargne,
  };
}

function getActualPercentages() {
  const t = getAllTotals();
  if (state.income === 0) return { besoins: 0, envies: 0, epargne: 0 };
  return {
    besoins: (t.besoins / state.income) * 100,
    envies:  (t.envies  / state.income) * 100,
    epargne: (t.epargne / state.income) * 100,
  };
}

function computeHealthScore() {
  const pct = getActualPercentages();
  let score = 100;

  // Besoins: pénalise si au-dessus de 50% (dépenses contraintes trop élevées)
  const besoinsSurplus = pct.besoins - 50;
  if (besoinsSurplus > 2) score -= Math.min((besoinsSurplus - 2) * 6, 40);

  // Envies: pénalise seulement si au-dessus de 30% (excès de dépenses plaisir)
  const enviesSurplus = pct.envies - 30;
  if (enviesSurplus > 2) score -= Math.min((enviesSurplus - 2) * 7, 40);

  // Épargne: pénalise seulement si en-dessous de 20% (épargne insuffisante)
  const epargneDeficit = 20 - pct.epargne;
  if (epargneDeficit > 2) score -= Math.min((epargneDeficit - 2) * 5, 40);

  // Dépassement de budget : pénalité plate
  const { total } = getAllTotals();
  if (total > state.income) score -= 25;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getScoreLabel(score) {
  if (score >= 85) return { label: 'Excellent 🌟',   color: '#34d399', desc: 'Votre budget est parfaitement équilibré. Félicitations !' };
  if (score >= 65) return { label: 'Bon 👍',         color: '#22d3ee', desc: 'Votre répartition est globalement bonne, quelques ajustements suffiraient.' };
  if (score >= 40) return { label: 'À améliorer ⚠️', color: '#f59e0b', desc: 'Votre budget s\'écarte des recommandations. Consultez les conseils ci-dessous.' };
  return               { label: 'Critique 🚨',    color: '#ef4444', desc: 'Votre budget nécessite une révision urgente. Agissez sur les points rouges.' };
}

function generateRecommendations() {
  const pct    = getActualPercentages();
  const { total, epargne: epargneAmt } = getAllTotals();
  const ideal  = getIdealBudget();
  const recs   = [];
  const fmt    = v => formatCurrency(v);

  if (total > state.income) {
    recs.push({
      severity: 'danger',
      icon: '🚨',
      title: 'Vous dépensez plus que vous ne gagnez',
      msg: `Vos dépenses totales (${fmt(total)}) dépassent votre revenu (${fmt(state.income)}). Réduisez immédiatement certaines dépenses non essentielles.`
    });
  }

  if (pct.besoins > 60) {
    recs.push({
      severity: 'danger',
      icon: '🏠',
      title: `Vos besoins représentent ${pct.besoins.toFixed(0)}% — trop élevé`,
      msg: `L'idéal est 50% (${fmt(ideal.besoins)}). Explorez des options pour réduire votre loyer, vos factures ou votre budget alimentation.`
    });
  } else if (pct.besoins > 53) {
    recs.push({
      severity: 'warning',
      icon: '🏠',
      title: `Vos besoins sont légèrement au-dessus de l'idéal (${pct.besoins.toFixed(0)}%)`,
      msg: `Objectif : 50% (${fmt(ideal.besoins)}). Cherchez à optimiser vos achats alimentaires ou à renégocier vos abonnements.`
    });
  }

  if (epargneAmt === 0) {
    recs.push({
      severity: 'danger',
      icon: '🏦',
      title: 'Vous n\'épargnez rien ce mois-ci',
      msg: `Même 50 €/mois placés sur un livret A représentent 600 €/an. Commencez petit, mais commencez maintenant !`
    });
  } else if (pct.epargne < 10) {
    recs.push({
      severity: 'danger',
      icon: '📉',
      title: `Votre taux d'épargne est très faible (${pct.epargne.toFixed(0)}%)`,
      msg: `L'objectif est 20% (${fmt(ideal.epargne)}). Essayez d'automatiser un virement épargne dès réception de votre salaire.`
    });
  } else if (pct.epargne < 18) {
    recs.push({
      severity: 'warning',
      icon: '💰',
      title: `Votre épargne est proche de l'objectif (${pct.epargne.toFixed(0)}%)`,
      msg: `Il vous manque ${fmt(ideal.epargne - epargneAmt)} pour atteindre les 20% recommandés (${fmt(ideal.epargne)}).`
    });
  }

  if (pct.envies > 38) {
    recs.push({
      severity: 'warning',
      icon: '✨',
      title: `Vos envies représentent ${pct.envies.toFixed(0)}% — au-dessus des 30%`,
      msg: `Idéal : ${fmt(ideal.envies)}. Examinez vos abonnements, sorties et achats pour identifier ce qui peut être réduit.`
    });
  }

  if (pct.besoins >= 44 && pct.besoins <= 53 && pct.envies >= 25 && pct.envies <= 33 && pct.epargne >= 18) {
    recs.push({
      severity: 'success',
      icon: '🎉',
      title: 'Budget bien équilibré selon la règle 50/30/20',
      msg: 'Continuez sur cette lancée ! Pensez à augmenter progressivement votre épargne et vos investissements.'
    });
  }

  if (pct.epargne >= 25) {
    recs.push({
      severity: 'success',
      icon: '🚀',
      title: `Excellent taux d'épargne ! (${pct.epargne.toFixed(0)}%)`,
      msg: 'Vous dépassez l\'objectif des 20%. Pensez à diversifier : livret A, assurance-vie, PEA pour optimiser le rendement.'
    });
  }

  if (recs.length === 0) {
    recs.push({
      severity: 'info',
      icon: '💡',
      title: 'Continuez à suivre votre budget',
      msg: 'La régularité est la clé. Revisitez cet outil chaque mois pour maintenir le cap sur vos objectifs financiers.'
    });
  }

  return recs;
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────

function formatCurrency(v) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(v);
}

function formatPct(v) {
  return v.toFixed(1) + '%';
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

function navigateTo(step, instant = false) {
  const ids = { hero: 'section-hero', input: 'section-input', dashboard: 'section-dashboard' };
  const current = document.querySelector('.section.active');

  const showNext = () => {
    if (current) {
      current.classList.remove('active');
      current.classList.add('hidden');
    }
    const next = document.getElementById(ids[step]);
    next.classList.remove('hidden', 'slide-out');
    next.classList.add('active');
    window.scrollTo(0, 0);

    if (step === 'input') {
      updateDisplayIncome();
      updateStickyBar();
      updateTabIndicator();
      updateTabSubtotals();
    }
    if (step === 'dashboard') {
      renderDashboard();
    }
  };

  if (instant || !current) {
    showNext();
  } else {
    current.classList.add('slide-out');
    setTimeout(showNext, 280);
  }

  state.currentStep = step;
  saveState();
}

// ─── INPUT SECTION ────────────────────────────────────────────────────────────

function renderExpensePanels() {
  Object.entries(CATEGORIES).forEach(([catKey, cat]) => {
    const panel = document.getElementById('panel-' + catKey);
    if (!panel) return;

    cat.subcategories.forEach(sub => {
      const row = document.createElement('div');
      row.className = 'expense-row';
      row.innerHTML = `
        <span class="expense-icon">${sub.icon}</span>
        <label class="expense-label" for="expense-${sub.id}">${sub.label}</label>
        <div class="expense-input-wrap">
          <span class="expense-currency">€</span>
          <input
            type="number"
            id="expense-${sub.id}"
            class="expense-input"
            placeholder="${sub.placeholder}"
            min="0"
            step="10"
            value="${state.expenses[sub.id] || ''}"
          >
        </div>
      `;
      panel.appendChild(row);
    });

    const subtotal = document.createElement('div');
    subtotal.className = 'panel-subtotal';
    subtotal.innerHTML = `<span>Sous-total ${cat.label}</span><strong id="panel-sub-${catKey}">0 €</strong>`;
    panel.appendChild(subtotal);
  });
}

function readAllInputs() {
  ALL_SUB_IDS.forEach(id => {
    const el = document.getElementById('expense-' + id);
    if (el) state.expenses[id] = parseFloat(el.value) || 0;
  });
  saveState();
}

function updateStickyBar() {
  const { total } = getAllTotals();
  const pct = state.income > 0 ? (total / state.income) * 100 : 0;

  document.getElementById('sticky-total').textContent = formatCurrency(total);
  document.getElementById('sticky-pct').textContent   = pct.toFixed(0) + '%';

  const fill = document.getElementById('sticky-progress-fill');
  fill.style.width = Math.min(pct, 100) + '%';
  fill.classList.toggle('over', pct > 100);
}

function updateTabSubtotals() {
  Object.keys(CATEGORIES).forEach(cat => {
    const t = getCategoryTotal(cat);
    document.getElementById('tab-subtotal-' + cat).textContent = formatCurrency(t);

    const panelSub = document.getElementById('panel-sub-' + cat);
    if (panelSub) panelSub.textContent = formatCurrency(t);
  });
}

function updateDisplayIncome() {
  document.getElementById('display-income').textContent = formatCurrency(state.income);
}

function updateTabIndicator() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (!activeBtn) return;
  const indicator = document.getElementById('tab-indicator');
  const switcher  = document.getElementById('tab-switcher');
  const swRect    = switcher.getBoundingClientRect();
  const btnRect   = activeBtn.getBoundingClientRect();
  indicator.style.left  = (btnRect.left - swRect.left) + 'px';
  indicator.style.width = btnRect.width + 'px';
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.expense-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== 'panel-' + tab);
    p.classList.toggle('active', p.id === 'panel-' + tab);
  });
  state.activeTab = tab;
  updateTabIndicator();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function renderDashboard() {
  const totals = getAllTotals();
  const ideal  = getIdealBudget();
  const pct    = getActualPercentages();
  const score  = computeHealthScore();
  const sl     = getScoreLabel(score);
  const recs   = generateRecommendations();

  // Date
  const now = new Date();
  document.getElementById('dashboard-date').textContent =
    now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  renderScoreGauge(score, sl);
  renderKPICards(totals, ideal, pct);
  renderDonutCharts(totals);
  renderCategoryCards(totals, ideal, pct);
  renderBarChart(totals);
  renderRecommendations(recs);

  // Animate progress bars after a tick so CSS transition fires
  setTimeout(() => {
    document.querySelectorAll('.progress-fill[data-target]').forEach(el => {
      el.style.width = el.dataset.target;
    });
  }, 80);
}

function renderScoreGauge(score, sl) {
  const gauge  = document.getElementById('score-gauge');
  const numEl  = document.getElementById('score-number');
  const labelEl = document.getElementById('score-label');
  const descEl  = document.getElementById('score-desc');

  labelEl.textContent = sl.label;
  labelEl.style.color = sl.color;
  descEl.textContent  = sl.desc;

  // Animate counter
  let current = 0;
  const duration = 1200;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(eased * score);
    numEl.textContent = current;
    const deg = (current / 100) * 360;
    gauge.style.background = `conic-gradient(${sl.color} ${deg}deg, #252837 ${deg}deg)`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderKPICards(totals, ideal, pct) {
  // Total dépensé
  document.getElementById('kpi-total').textContent     = formatCurrency(totals.total);
  document.getElementById('kpi-total-sub').textContent = `sur ${formatCurrency(state.income)} de revenu`;

  // Solde
  const solde = state.income - totals.total;
  const soldeEl = document.getElementById('kpi-solde');
  soldeEl.textContent = formatCurrency(solde);
  soldeEl.className   = 'kpi-value ' + (solde >= 0 ? 'positive' : 'negative');
  document.getElementById('kpi-solde-sub').textContent = solde >= 0 ? 'non alloué' : 'en déficit';

  // Épargne rate
  const rate = state.income > 0 ? (totals.epargne / state.income) * 100 : 0;
  const rateEl = document.getElementById('kpi-epargne-rate');
  rateEl.textContent = rate.toFixed(1) + '%';
  rateEl.className   = 'kpi-value ' + (rate >= 20 ? 'positive' : rate >= 10 ? '' : 'negative');
}

function renderDonutCharts(totals) {
  const cats   = Object.values(CATEGORIES);
  const colors = cats.map(c => c.color);
  const labels = cats.map(c => c.label);

  const actualData = [totals.besoins, totals.envies, totals.epargne];
  const idealData  = [
    state.income * RULES.besoins,
    state.income * RULES.envies,
    state.income * RULES.epargne
  ];

  const donutOpts = (data) => ({
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#1a1d27',
        borderWidth: 3,
        hoverOffset: 6,
      }]
    },
    options: {
      cutout: '72%',
      animation: { animateRotate: true, duration: 1000, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
              return ` ${formatCurrency(ctx.parsed)}  (${pct}%)`;
            }
          }
        }
      }
    }
  });

  if (donutActualChart) donutActualChart.destroy();
  if (donutIdealChart)  donutIdealChart.destroy();

  const ctxA = document.getElementById('donut-actual').getContext('2d');
  const ctxI = document.getElementById('donut-ideal').getContext('2d');
  donutActualChart = new Chart(ctxA, donutOpts(actualData));
  donutIdealChart  = new Chart(ctxI, donutOpts(idealData));

  // Legends
  renderDonutLegend('legend-actual', labels, colors, actualData, actualData.reduce((a,b)=>a+b,0));
  renderDonutLegend('legend-ideal',  labels, colors, idealData,  state.income);
}

function renderDonutLegend(containerId, labels, colors, data, total) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  labels.forEach((label, i) => {
    const pct = total > 0 ? ((data[i] / total) * 100).toFixed(1) : '0.0';
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-left">
        <div class="legend-dot" style="background:${colors[i]}"></div>
        <span class="legend-name">${label}</span>
      </div>
      <div class="legend-vals">
        <span class="legend-pct">${pct}%</span>
        <span class="legend-amt">${formatCurrency(data[i])}</span>
      </div>
    `;
    el.appendChild(item);
  });
}

function renderCategoryCards(totals, ideal, pct) {
  const container = document.getElementById('category-cards');
  container.innerHTML = '';

  Object.entries(CATEGORIES).forEach(([catKey, cat]) => {
    const actual  = totals[catKey];
    const target  = ideal[catKey];
    const actualPct = pct[catKey];
    const targetPct = cat.target * 100;
    const barW    = state.income > 0 ? Math.min((actual / state.income) * 100, 100) : 0;
    const isOver  = actualPct > targetPct + 3;
    const isUnder = catKey === 'epargne' && actualPct < targetPct - 5;

    let badgeClass = 'ok', badgeText = 'OK';
    if (isOver)  { badgeClass = 'over';    badgeText = 'Élevé';   }
    if (isUnder) { badgeClass = 'under';   badgeText = 'Faible';  }

    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-card-header">
        <div class="cat-color-bar" style="background:${cat.color}"></div>
        <span class="cat-icon">${cat.icon}</span>
        <div class="cat-info">
          <div class="cat-name">${cat.label}</div>
          <div class="cat-amounts">${formatCurrency(actual)} / idéal ${formatCurrency(target)}</div>
        </div>
        <div class="cat-right">
          <div class="cat-pct" style="color:${cat.color}">${actualPct.toFixed(1)}%</div>
          <div class="cat-target">Cible ${targetPct}%</div>
          <span class="cat-badge ${badgeClass}">${badgeText}</span>
        </div>
        <span class="cat-expand-icon">▼</span>
      </div>
      <div class="cat-progress-wrap">
        <div class="progress-track">
          <div class="progress-fill ${isOver ? 'over' : ''}"
               style="background:${cat.color}; width:0%"
               data-target="${barW.toFixed(1)}%"></div>
        </div>
      </div>
      <div class="cat-subcategories">
        ${cat.subcategories.map(sub => {
          const v = state.expenses[sub.id] || 0;
          return `
            <div class="sub-row">
              <span class="sub-icon">${sub.icon}</span>
              <span class="sub-label">${sub.label}</span>
              <span class="sub-amt ${v === 0 ? 'zero' : ''}">${v === 0 ? '—' : formatCurrency(v)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    card.querySelector('.cat-card-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    container.appendChild(card);
  });
}

function renderBarChart(totals) {
  const allSubs = [];
  Object.entries(CATEGORIES).forEach(([catKey, cat]) => {
    cat.subcategories.forEach(sub => {
      const val = state.expenses[sub.id] || 0;
      if (val > 0) {
        allSubs.push({
          label: sub.label,
          value: val,
          color: cat.color,
          catLabel: cat.label
        });
      }
    });
  });

  allSubs.sort((a, b) => b.value - a.value);

  if (barChart) barChart.destroy();

  const wrap = document.querySelector('.bar-chart-wrap');
  wrap.style.height = Math.max(240, allSubs.length * 38 + 40) + 'px';

  const ctx = document.getElementById('bar-chart').getContext('2d');
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: allSubs.map(s => s.label),
      datasets: [{
        data: allSubs.map(s => s.value),
        backgroundColor: allSubs.map(s => s.color + 'cc'),
        borderColor:     allSubs.map(s => s.color),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 },
            callback: v => formatCurrency(v) }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 12 } }
        }
      }
    }
  });
}

function renderRecommendations(recs) {
  const container = document.getElementById('recommendations');
  container.innerHTML = '';
  recs.forEach(rec => {
    const card = document.createElement('div');
    card.className = `rec-card ${rec.severity}`;
    card.innerHTML = `
      <div class="rec-icon">${rec.icon}</div>
      <div class="rec-body">
        <div class="rec-title">${rec.title}</div>
        <div class="rec-msg">${rec.msg}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, 2800);
}

// ─── RESET ────────────────────────────────────────────────────────────────────

function resetApp() {
  state = {
    income: 0,
    expenses: Object.fromEntries(ALL_SUB_IDS.map(id => [id, 0])),
    currentStep: 'hero',
    activeTab: 'besoins',
  };
  localStorage.removeItem('kakebo_state');
  if (donutActualChart) { donutActualChart.destroy(); donutActualChart = null; }
  if (donutIdealChart)  { donutIdealChart.destroy();  donutIdealChart  = null; }
  if (barChart)         { barChart.destroy();          barChart         = null; }

  document.getElementById('income-input').value = '';
  document.getElementById('btn-start').disabled = true;
  ALL_SUB_IDS.forEach(id => {
    const el = document.getElementById('expense-' + id);
    if (el) el.value = '';
  });

  navigateTo('hero', true);
  showToast('Nouvelle analyse démarrée ✨');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  renderExpensePanels();

  // Hero: income input
  const incomeInput = document.getElementById('income-input');
  const btnStart    = document.getElementById('btn-start');

  incomeInput.addEventListener('input', () => {
    const val = parseFloat(incomeInput.value);
    state.income = val > 0 ? val : 0;
    btnStart.disabled = !(val > 0);
  });

  btnStart.addEventListener('click', () => {
    if (state.income <= 0) return;
    navigateTo('input');
  });

  // Tab switcher
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Expense inputs (live update)
  document.querySelectorAll('.expense-input').forEach(input => {
    input.addEventListener('input', () => {
      readAllInputs();
      updateStickyBar();
      updateTabSubtotals();
    });
  });

  // Analyze button
  document.getElementById('btn-analyze').addEventListener('click', () => {
    readAllInputs();
    navigateTo('dashboard');
  });

  // Edit income
  document.getElementById('btn-edit-income').addEventListener('click', () => {
    navigateTo('hero');
  });

  // Back to edit
  document.getElementById('btn-back-edit').addEventListener('click', () => {
    navigateTo('input');
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', resetApp);

  // Tab indicator: reposition on resize
  window.addEventListener('resize', () => {
    if (state.currentStep === 'input') updateTabIndicator();
  });

  // Restore from localStorage
  loadState();

  // Show hero if nothing restored
  if (state.currentStep === 'hero') {
    const hero = document.getElementById('section-hero');
    hero.classList.remove('hidden');
    hero.classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', init);
