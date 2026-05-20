// dashboard.js — UI rendering, filters, modals, form handling, and toast notifications
var blockerChart  = null;
var editingSpId   = null;
var currentDocRfp = null;
var filteredRows  = [];
var pipePage      = 1;
var PAGE_SIZE     = 20;

function getData() { return isLive && liveData ? liveData : []; }

// ═══════════════════════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════════════════════
function renderAll(data) {
  renderScorecards(data);
  renderActiveBids(data);
  renderBlockerChart(data);
  renderRegions(data);
  populateRegionFilter(data);
  filteredRows = data.slice();
  pipePage = 1;
  renderPipelineTable();
  renderGaps(data);
}

// ═══════════════════════════════════════════════════════════════════
// SCORECARDS
// ═══════════════════════════════════════════════════════════════════
function renderScorecards(data) {
  var n  = data.length;
  var ip = data.filter(function(r){ return r.status === 'In Progress'; }).length;
  var sb = data.filter(function(r){ return r.status === 'Submitted'; }).length;
  var wn = data.filter(function(r){ return r.status === 'Won'; }).length;
  var dr = data.filter(function(r){ return r.status === 'Dropped'; }).length;
  var ls = data.filter(function(r){ return r.status === 'Lost'; }).length;
  var cards = [
    { l: 'Total RFPs',       v: n,      s: 'All tracked',            c: 'sc-white' },
    { l: 'In Progress',      v: ip,     s: 'Active bids',            c: 'sc-blue' },
    { l: 'Submitted',        v: sb,     s: 'Awaiting decision',      c: 'sc-orange' },
    { l: 'Won',              v: wn,     s: 'Closed won',             c: 'sc-green' },
    { l: 'Lost',             v: ls,     s: 'Closed lost',            c: 'sc-red' },
    { l: 'Dropped',          v: dr,     s: 'Declined / no-bid',      c: 'sc-yellow' }
  ];
  document.getElementById('scorecards').innerHTML = cards.map(function(c) {
    return '<div class="scorecard ' + c.c + '">' +
      '<div class="sc-label">' + c.l + '</div>' +
      '<div class="sc-value">' + c.v + '</div>' +
      '<div class="sc-sub">' + c.s + '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVE BIDS
// ═══════════════════════════════════════════════════════════════════
function renderActiveBids(data) {
  var active = data
    .filter(function(r){ return r.status === 'In Progress' || r.status === 'Submitted'; })
    .sort(function(a, b){ return (a.deadline || '9').localeCompare(b.deadline || '9'); });
  document.getElementById('activeBidsCount').textContent = active.length;
  var tb = document.getElementById('activeBidsTbody');
  if (!active.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">No active bids</td></tr>';
    return;
  }
  tb.innerHTML = active.slice(0, 14).map(function(r) {
    return '<tr>' +
      '<td class="trunc" title="' + X(r.authority) + '">' + X(r.authority) + '</td>' +
      '<td class="td-muted">' + X(r.region) + '</td>' +
      '<td class="td-muted" style="white-space:nowrap">' + fmtDate(r.deadline) + '</td>' +
      '<td class="td-muted">' + X(r.division || '') + '</td>' +
      '<td>' + statusBadge(r.status) + '</td>' +
    '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// BLOCKER CHART
// ═══════════════════════════════════════════════════════════════════
function renderBlockerChart(data) {
  var counts = {};
  data.forEach(function(r) {
    var b = r.blocking;
    if (b && b !== 'None' && b !== '') counts[b] = (counts[b] || 0) + 1;
  });
  var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
  var canvas = document.getElementById('blockerChart');
  if (blockerChart) { blockerChart.destroy(); blockerChart = null; }
  if (!sorted.length) { canvas.style.display = 'none'; return; }
  canvas.style.display = '';
  var labels = sorted.map(function(e) { return e[0]; });
  var values = sorted.map(function(e) { return e[1]; });
  var h = Math.max(140, sorted.length * 30);
  canvas.style.height = h + 'px';
  blockerChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.map(function(l) { return l.length > 24 ? l.slice(0, 24) + '…' : l; }),
      datasets: [{
        data: values,
        backgroundColor: 'rgba(232,117,0,0.65)',
        borderColor: '#E87500',
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return labels[items[0].dataIndex]; },
            label: function(item) { return ' ' + item.raw + ' bid' + (item.raw !== 1 ? 's' : '') + ' blocked'; }
          },
          backgroundColor: '#1A1A1A', borderColor: '#333', borderWidth: 1,
          titleColor: '#fff', bodyColor: '#999'
        }
      },
      scales: {
        x: { grid: { color: '#1c1c1c' }, ticks: { color: '#666', font: { size: 11 } }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: '#999', font: { size: 11 } } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// REGIONS
// ═══════════════════════════════════════════════════════════════════
function renderRegions(data) {
  var map = {};
  data.forEach(function(r) {
    var k = r.region || 'Unknown';
    if (!map[k]) map[k] = { total: 0, active: 0, nogo: 0 };
    map[k].total++;
    if (r.status === 'In Progress' || r.status === 'Submitted') map[k].active++;
    if (r.status === 'Dropped' || r.status === 'Lost') map[k].nogo++;
  });
  var sorted = Object.entries(map).sort(function(a, b) { return b[1].total - a[1].total; });
  var max = sorted.length ? sorted[0][1].total : 1;
  document.getElementById('regionBreakdown').innerHTML = sorted.map(function(entry) {
    var reg = entry[0], s = entry[1];
    return '<div class="region-row">' +
      '<div class="region-name" title="' + X(reg) + '">' + X(reg) + '</div>' +
      '<div class="region-bar-wrap"><div class="region-bar" style="width:' + Math.round(s.total / max * 100) + '%"></div></div>' +
      '<div class="region-stats">' + s.total + ' total · ' + Math.round(s.nogo / s.total * 100) + '% no-bid</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE TABLE
// ═══════════════════════════════════════════════════════════════════
function populateRegionFilter(data) {
  var regionSet = {};
  data.forEach(function(r) { if (r.region) regionSet[r.region] = true; });
  var regions = Object.keys(regionSet).sort();
  var sel = document.getElementById('filterCountry');
  var cur = sel.value;
  sel.innerHTML = '<option value="">All Regions</option>' +
    regions.map(function(r) { return '<option' + (r === cur ? ' selected' : '') + '>' + X(r) + '</option>'; }).join('');
}

function applyFilters() {
  var q    = document.getElementById('searchInput').value.toLowerCase();
  var ctry = document.getElementById('filterCountry').value;
  var stat = document.getElementById('filterStatus').value;
  var div  = document.getElementById('filterDivision').value;
  var data = getData();
  filteredRows = data.filter(function(r) {
    if (ctry && r.region !== ctry) return false;
    if (stat && r.status !== stat) return false;
    if (div && r.division !== div) return false;
    if (q) {
      var h = ((r.id || '') + ' ' + (r.authority || '') + ' ' + (r.title || '')).toLowerCase();
      if (h.indexOf(q) === -1) return false;
    }
    return true;
  });
  pipePage = 1;
  renderPipelineTable();
}

function renderPipelineTable() {
  var start = (pipePage - 1) * PAGE_SIZE;
  var slice = filteredRows.slice(start, start + PAGE_SIZE);
  var total = Math.ceil(filteredRows.length / PAGE_SIZE);
  document.getElementById('pipelineCount').textContent =
    filteredRows.length + ' record' + (filteredRows.length !== 1 ? 's' : '');
  var tb = document.getElementById('pipelineTbody');
  if (!filteredRows.length) {
    var msg = isLive
      ? 'No RFPs found. Use Add RFP to create your first entry.'
      : 'Sign in with your Saints & Masters account to load RFP data';
    tb.innerHTML = '<tr><td colspan="12" class="empty">' + msg + '</td></tr>';
  } else if (!slice.length) {
    tb.innerHTML = '<tr><td colspan="12" class="empty">No records match your filters</td></tr>';
  } else {
    tb.innerHTML = slice.map(function(r) {
      return '<tr>' +
        '<td><span class="rfp-id">' + X(r.id) + '</span></td>' +
        '<td class="trunc" title="' + X(r.authority) + '">' + X(r.authority) + '</td>' +
        '<td class="trunc" title="' + X(r.title) + '">' + X(r.title) + '</td>' +
        '<td class="td-muted" style="white-space:nowrap">' + X(r.value) + '</td>' +
        '<td class="td-muted" style="white-space:nowrap">' + X(r.region) + '</td>' +
        '<td class="td-muted">' + X(r.industry) + '</td>' +
        '<td class="td-muted">' + X(r.division) + '</td>' +
        '<td class="td-muted">' + X(r.sourceType) + '</td>' +
        '<td class="td-muted" style="white-space:nowrap">' + fmtDate(r.deadline) + '</td>' +
        '<td>' + statusBadge(r.submissionStatus) + '</td>' +
        '<td>' + statusBadge(r.status) + '</td>' +
        '<td class="td-muted trunc" title="' + X(r.remarks) + '">' + (X(r.remarks) || '—') + '</td>' +
        '<td><div class="td-actions">' +
          '<button class="btn btn-secondary btn-icon btn-sm" title="Edit" onclick="openEditModal(\'' + X(r.id) + '\')">' +
            '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
          '</button>' +
          '<button class="btn btn-secondary btn-icon btn-sm" title="Documents" onclick="openDocModal(\'' + X(r.id) + '\',\'' + X(r.title) + '\',\'' + X(r.region) + '\')">' +
            '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>' +
          '</button>' +
          '<button class="btn btn-danger btn-icon btn-sm" title="Delete" onclick="confirmDelete(\'' + X(r.id) + '\')">' +
            '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
          '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }
  // Pagination
  var pag = document.getElementById('paginationWrap');
  if (total <= 1) { pag.innerHTML = ''; return; }
  var html = '<span class="pg-info">Page ' + pipePage + ' of ' + total + '</span>';
  html += '<button class="btn btn-ghost btn-sm" ' + (pipePage === 1 ? 'disabled' : '') + ' onclick="goPage(' + (pipePage - 1) + ')">‹</button>';
  var s = Math.max(1, pipePage - 2), e = Math.min(total, s + 4);
  for (var p = s; p <= e; p++)
    html += '<button class="btn btn-sm ' + (p === pipePage ? 'btn-primary' : 'btn-ghost') + '" onclick="goPage(' + p + ')">' + p + '</button>';
  html += '<button class="btn btn-ghost btn-sm" ' + (pipePage === total ? 'disabled' : '') + ' onclick="goPage(' + (pipePage + 1) + ')">›</button>';
  pag.innerHTML = html;
}
function goPage(p) { pipePage = p; renderPipelineTable(); }

// ═══════════════════════════════════════════════════════════════════
// GAPS TABLE
// ═══════════════════════════════════════════════════════════════════
function renderGaps(data) {
  var counts = {};
  data.forEach(function(r) {
    var b = r.blocking;
    if (b && b !== 'None' && b !== '') counts[b] = (counts[b] || 0) + 1;
  });
  var sorted = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; });
  var max = sorted.length ? sorted[0][1] : 1;
  var tb = document.getElementById('gapsTbody');
  if (!sorted.length) {
    tb.innerHTML = '<tr><td colspan="3" class="empty">No blocking criteria recorded</td></tr>';
    return;
  }
  tb.innerHTML = sorted.map(function(entry) {
    var crit = entry[0], cnt = entry[1];
    return '<tr class="gap-row" onclick="openGapsDetail(\'' + X(crit) + '\')">' +
      '<td><strong>' + X(crit) + '</strong></td>' +
      '<td><span style="font-family:\'Syne\',sans-serif;font-size:20px;font-weight:700;color:var(--accent)">' + cnt + '</span>' +
          '<span class="td-muted" style="margin-left:5px">bid' + (cnt !== 1 ? 's' : '') + '</span></td>' +
      '<td>' +
        '<div class="gap-bar-wrap"><div class="gap-bar" style="width:' + Math.round(cnt / max * 100) + '%"></div></div>' +
        '<span class="td-muted" style="margin-left:8px;font-size:11px">' + Math.round(cnt / max * 100) + '%</span>' +
      '</td>' +
    '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════
// ADD / EDIT MODAL
// ═══════════════════════════════════════════════════════════════════
function openAddModal() {
  editingSpId = null;
  document.getElementById('rfpModalTitle').textContent = 'Add New RFP';
  document.getElementById('rfpForm').reset();
  toggleBlockingFields();
  document.getElementById('rfpModalOverlay').classList.add('open');
}

function openEditModal(rfpId) {
  var rec = getData().find(function(r) { return r.id === rfpId; });
  if (!rec) { toast('error', 'Record not found'); return; }
  editingSpId = rec._spId || null;
  document.getElementById('rfpModalTitle').textContent = 'Edit — ' + rfpId;
  var form = document.getElementById('rfpForm');
  form.reset();
  function set(n, v) { var el = form.elements[n]; if (el && v != null) el.value = v; }
  set('RFPId', rec.id);
  set('IssuingAuthority', rec.authority);
  set('RFPTitle', rec.title);
  set('RFPValue', rec.value);
  set('CountryOfOrigin', rec.region);
  set('Industry', rec.industry);
  set('SourceDivision', rec.division);
  set('SourceType', rec.sourceType);
  set('IdentificationDate', rec.identDate);
  set('AssessmentDate', rec.assessmentDate);
  set('SubmissionStatus', rec.submissionStatus);
  set('SubmissionDeadline', rec.deadline);
  set('OpportunityStatus', rec.status);
  set('QuerySubmissionDeadline', rec.queryDeadline);
  set('ResponseReceivedDate', rec.responseDate);
  set('Comments', rec.remarks);
  set('BlockingCategory', rec.blocking);
  set('BlockingDetail', rec.blockingDetail);
  set('DocumentPath', rec.documentPath);
  toggleBlockingFields();
  document.getElementById('rfpModalOverlay').classList.add('open');
}

function closeRfpModal() {
  document.getElementById('rfpModalOverlay').classList.remove('open');
  editingSpId = null;
}

// Show/hide blocking fields based on SubmissionStatus
function toggleBlockingFields() {
  var ss = document.getElementById('rfpForm').elements['SubmissionStatus'].value;
  var show = (ss === 'Dropped');
  document.getElementById('blockingCategoryGroup').style.display = show ? '' : 'none';
  document.getElementById('blockingDetailGroup').style.display = show ? '' : 'none';
  if (!show) {
    document.getElementById('rfpForm').elements['BlockingCategory'].value = '';
    document.getElementById('rfpForm').elements['BlockingDetail'].value = '';
  }
}

// ═══════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════
function confirmDelete(rfpId) {
  var rec = getData().find(function(r) { return r.id === rfpId; });
  document.getElementById('confirmMsg').textContent =
    'Delete "' + rfpId + (rec && rec.title ? ' — ' + rec.title : '') + '"? This action cannot be undone.';
  document.getElementById('confirmOverlay').classList.add('open');
  document.getElementById('confirmOkBtn').onclick = function() { doDelete(rfpId); };
}
function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('open'); }

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTS MODAL
// ═══════════════════════════════════════════════════════════════════
function openDocModal(rfpId, rfpTitle, region) {
  currentDocRfp = { id: rfpId, title: rfpTitle, region: region };
  document.getElementById('docModalTitle').textContent = 'Documents — ' + rfpId;
  document.getElementById('docModalPath').textContent = 'OneDrive: RFP Documents / ' + region + ' / ' + rfpId;
  document.getElementById('docModalOverlay').classList.add('open');
  loadDocList();
}
function closeDocModal() {
  document.getElementById('docModalOverlay').classList.remove('open');
  currentDocRfp = null;
}

function handleDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function handleDragLeave() { document.getElementById('dropZone').classList.remove('drag-over'); }
function handleDrop(e) { e.preventDefault(); handleDragLeave(); uploadFiles(Array.from(e.dataTransfer.files)); }
function handleFileSelect(e) { uploadFiles(Array.from(e.target.files)); e.target.value = ''; }

// ═══════════════════════════════════════════════════════════════════
// GAPS DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════
function openGapsDetail(criteria) {
  var rfps = getData().filter(function(r) { return r.blocking === criteria; });
  document.getElementById('gapsDetailTitle').textContent = 'Blocked by: ' + criteria;
  document.getElementById('gapsDetailTbody').innerHTML = rfps.map(function(r) {
    return '<tr>' +
      '<td><span class="rfp-id">' + X(r.id) + '</span></td>' +
      '<td class="trunc" title="' + X(r.authority) + '">' + X(r.authority) + '</td>' +
      '<td class="td-muted">' + X(r.region) + '</td>' +
      '<td class="td-muted" style="white-space:nowrap">' + X(r.value || '—') + '</td>' +
      '<td class="td-muted">' + (X(r.remarks) || '—') + '</td>' +
    '</tr>';
  }).join('');
  document.getElementById('gapsDetailOverlay').classList.add('open');
}
function closeGapsDetail() { document.getElementById('gapsDetailOverlay').classList.remove('open'); }

// ═══════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════
function switchTab(name) {
  var names = ['overview', 'pipeline', 'gaps'];
  document.querySelectorAll('.tab').forEach(function(t, i) { t.classList.toggle('active', names[i] === name); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'tab-' + name); });
  if (name === 'pipeline') applyFilters();
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function X(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch(e) { return iso; }
}
function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function fmtSize(b) {
  if (!b) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function statusBadge(s) {
  var m = {
    'In Progress': 'badge-blue', 'Submitted': 'badge-orange', 'Won': 'badge-green',
    'Lost': 'badge-red', 'Dropped': 'badge-red', 'Not Submitted': 'badge-yellow'
  };
  return '<span class="badge ' + (m[s] || 'badge-gray') + '">' + (X(s) || '—') + '</span>';
}

// ═══════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════
function toast(type, msg) {
  var c = document.getElementById('toastContainer');
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  var ic = { success: '✓', error: '✕', info: 'i' };
  el.innerHTML = '<span style="font-weight:700">' + (ic[type] || 'i') + '</span><span>' + X(msg) + '</span>';
  c.appendChild(el);
  setTimeout(function() {
    el.style.animation = 'slideOut .2s ease forwards';
    setTimeout(function() { el.remove(); }, 220);
  }, 4500);
}

// ═══════════════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeRfpModal(); closeDocModal(); closeGapsDetail(); closeConfirm();
  }
});
