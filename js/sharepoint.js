// sharepoint.js — Microsoft Graph API calls for SharePoint lists and OneDrive documents
var liveData = null;

// Debug: call debugListFields() from browser console to see actual SharePoint column internal names
async function debugListFields() {
  var url = GRAPH + '/sites/' + SP_SITE_ID + '/lists/' + SP_LIST_ID + '/columns';
  var resp = await gGet(url);
  var json = await resp.json();
  var cols = (json.value || [])
    .filter(function(c) { return !c.readOnly || c.name === 'Title'; })
    .map(function(c) { return { display: c.displayName, internal: c.name, type: c.text ? 'text' : c.choice ? 'choice' : c.dateTime ? 'dateTime' : c.number ? 'number' : c.note ? 'note' : 'other' }; });
  console.table(cols);
  return cols;
}

// Graph HTTP helpers
function authHdr() {
  return { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
}
function gGet(url)        { return fetch(url, { headers: authHdr() }); }
function gPost(url, body) { return fetch(url, { method: 'POST',  headers: authHdr(), body: JSON.stringify(body) }); }
function gPatch(url, body){ return fetch(url, { method: 'PATCH', headers: authHdr(), body: JSON.stringify(body) }); }
function gDelete(url)     { return fetch(url, { method: 'DELETE', headers: authHdr() }); }
function gPut(url, blob)  {
  return fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob
  });
}

// Load RFP list from SharePoint
async function loadLiveData() {
  setStatus('live', 'Loading from SharePoint…');
  try {
    var url = GRAPH + '/sites/' + SP_SITE_ID + '/lists/' + SP_LIST_ID + '/items?expand=fields&$top=500';
    var resp = await gGet(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    var json = await resp.json();
    liveData = (json.value || []).map(spToRecord);
    isLive = true;
    applyUserUI(currentAcct);
    var t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setStatus('live', 'Live data — last refreshed ' + t);
    renderAll(liveData);
    toast('success', 'Loaded ' + liveData.length + ' RFPs from SharePoint');
  } catch(err) {
    console.error(err);
    toast('error', 'SharePoint load failed: ' + err.message);
    showUnauthenticated();
  }
}

// Map SharePoint list item to flat record object
// Internal names from debugListFields() — some have typos in SP, keep as-is
function spToRecord(item) {
  var f = item.fields || {};
  return {
    _spId:            item.id,
    id:               f.RFPID                || '',
    authority:        f.IssuingAuthority      || '',
    title:            f.Title                 || '',
    value:            f.EstimatedValue        || '',
    region:           f.Country               || '',
    industry:         f.Industry              || '',
    division:         f.SourcePortal          || '',
    sourceType:       f.RFPCategory           || '',
    identDate:        isoDate(f.IdentificatonDate),
    assessmentDate:   isoDate(f.AssessmentDate),
    submissionStatus: f.Status                || '',
    deadline:         isoDate(f.SubmissionDeadline),
    status:           f.OpportunityStatus     || '',
    queryDeadline:    isoDate(f.QuerySubmissionDeadline),
    responseDate:     isoDate(f.ResponseReceivedDate),
    remarks:          f.RFPRemarks            || '',
    blocking:         f.BlockingCriteria      || '',
    blockingDetail:   f.CrieriaDetail         || '',
    documentPath:     f.DocumentPath          || ''
  };
}
function isoDate(s) { return s ? s.split('T')[0] : ''; }

// Build fields object from form for Graph API POST/PATCH
// Keys = SharePoint internal column names (from debugListFields)
function buildFields(form) {
  var d = {};
  function add(k, v) { if (v !== '' && v != null) d[k] = v; }
  add('RFPID',                   form.elements['RFPId'].value.trim());
  add('Title',                   form.elements['RFPTitle'].value.trim());
  add('IssuingAuthority',        form.elements['IssuingAuthority'].value.trim());
  add('EstimatedValue',          form.elements['RFPValue'].value.trim());
  add('Country',                 form.elements['CountryOfOrigin'].value.trim());
  add('Industry',                form.elements['Industry'].value.trim());
  add('SourcePortal',            form.elements['SourceDivision'].value);
  add('RFPCategory',             form.elements['SourceType'].value.trim());
  add('IdentificatonDate',       form.elements['IdentificationDate'].value || null);
  add('AssessmentDate',          form.elements['AssessmentDate'].value || null);
  add('Status',                  form.elements['SubmissionStatus'].value);
  add('SubmissionDeadline',      form.elements['SubmissionDeadline'].value || null);
  add('OpportunityStatus',       form.elements['OpportunityStatus'].value);
  add('QuerySubmissionDeadline', form.elements['QuerySubmissionDeadline'].value || null);
  add('ResponseReceivedDate',    form.elements['ResponseReceivedDate'].value || null);
  add('RFPRemarks',              form.elements['Comments'].value.trim());
  add('BlockingCriteria',        form.elements['BlockingCategory'].value);
  add('CrieriaDetail',           form.elements['BlockingDetail'].value.trim());
  // Auto-generate document path from Country + RFP ID
  var country = form.elements['CountryOfOrigin'].value.trim();
  var rfpId = form.elements['RFPId'].value.trim().replace(/\//g, '-');
  if (country && rfpId) {
    add('DocumentPath', 'RFP Documents/' + country + '/' + rfpId);
  }
  return d;
}

// Submit add/edit form
async function submitRfpForm(e) {
  e.preventDefault();
  var form = document.getElementById('rfpForm');
  var btn = document.getElementById('rfpSubmitBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  var fields = buildFields(form);

  if (!isLive) {
    toast('info', 'Sign in to save to SharePoint');
    closeRfpModal(); btn.disabled = false; btn.textContent = 'Save RFP'; return;
  }
  try {
    if (editingSpId) {
      var url = GRAPH + '/sites/' + SP_SITE_ID + '/lists/' + SP_LIST_ID + '/items/' + editingSpId + '/fields';
      var r = await gPatch(url, fields);
      if (!r.ok) { var e2 = await r.json().catch(function(){ return {}; }); throw new Error(e2.error && e2.error.message || 'HTTP ' + r.status); }
      toast('success', 'RFP updated');
    } else {
      var url = GRAPH + '/sites/' + SP_SITE_ID + '/lists/' + SP_LIST_ID + '/items';
      var r = await gPost(url, { fields: fields });
      if (!r.ok) { var e2 = await r.json().catch(function(){ return {}; }); throw new Error(e2.error && e2.error.message || 'HTTP ' + r.status); }
      toast('success', 'RFP added');
    }
    // Upload any attached files to OneDrive
    var rfpFiles = document.getElementById('rfpFileInput');
    if (rfpFiles && rfpFiles.files.length > 0) {
      var country = form.elements['CountryOfOrigin'].value.trim();
      var rfpId = form.elements['RFPId'].value.trim();
      if (country && rfpId) {
        btn.textContent = 'Uploading files…';
        await uploadFilesForNewRfp(Array.from(rfpFiles.files), country, rfpId);
      }
    }
    closeRfpModal();
    await loadLiveData();
  } catch(err) { toast('error', 'Save failed: ' + err.message); }
  btn.disabled = false; btn.textContent = 'Save RFP';
}

// Delete RFP
async function doDelete(rfpId) {
  closeConfirm();
  if (!isLive) { toast('info', 'Sign in to delete from SharePoint'); return; }
  var rec = getData().find(function(r) { return r.id === rfpId; });
  if (!rec || !rec._spId) { toast('error', 'SharePoint item ID not found'); return; }
  try {
    var r = await gDelete(GRAPH + '/sites/' + SP_SITE_ID + '/lists/' + SP_LIST_ID + '/items/' + rec._spId);
    if (!r.ok && r.status !== 204) throw new Error('HTTP ' + r.status);
    toast('success', 'RFP deleted');
    await loadLiveData();
  } catch(err) { toast('error', 'Delete failed: ' + err.message); }
}

// Encode each path segment individually (don't encode the slashes)
function encodeDrivePath(path) {
  return path.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
}

// Build OneDrive folder path: {ONEDRIVE_BASE}/{Country}/{RFP-ID}
// Slashes in RFP ID (e.g. 04886/2026) become dashes for safe folder names
function docPath(region, rfpId) {
  return ONEDRIVE_BASE + '/' + region + '/' + rfpId.replace(/\//g, '-');
}

// Graph API drive path URL builder
function driveUrl(path) {
  return GRAPH + '/me/drive/root:/' + encodeDrivePath(path);
}

// Document management — list files in an RFP's OneDrive folder
async function loadDocList() {
  var list = document.getElementById('docList');
  list.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading files…</div>';
  if (!isLive || !accessToken) {
    list.innerHTML = '<div class="empty" style="color:var(--muted2)">Sign in to view documents</div>';
    return;
  }
  var path = docPath(currentDocRfp.region, currentDocRfp.id);
  try {
    var resp = await gGet(driveUrl(path) + ':/children');
    if (resp.status === 404) {
      list.innerHTML = '<div class="empty" style="color:var(--muted2)">No documents yet — upload files below</div>';
      return;
    }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var json = await resp.json();
    var files = (json.value || []).filter(function(f) { return !f.folder; });
    if (!files.length) {
      list.innerHTML = '<div class="empty" style="color:var(--muted2)">No documents yet — upload files below</div>';
      return;
    }
    list.innerHTML = files.map(function(f) {
      return '<div class="doc-item">' +
        '<span class="doc-icon">&#128196;</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="doc-name">' + X(f.name) + '</div>' +
          '<div class="doc-meta">' + fmtSize(f.size) + ' · Modified ' + fmtDate(f.lastModifiedDateTime ? f.lastModifiedDateTime.split('T')[0] : '') + '</div>' +
        '</div>' +
        (f['@microsoft.graph.downloadUrl']
          ? '<a class="doc-dl" href="' + X(f['@microsoft.graph.downloadUrl']) + '" target="_blank" download="' + X(f.name) + '">Download</a>'
          : '') +
      '</div>';
    }).join('');
  } catch(err) {
    list.innerHTML = '<div class="empty" style="color:var(--red)">Error: ' + X(err.message) + '</div>';
  }
}

// Upload files to OneDrive — used by both the Documents modal and the Add RFP form
async function uploadFiles(files) {
  if (!isLive || !accessToken) { toast('error', 'Sign in to upload'); return; }
  if (!currentDocRfp || !files.length) return;
  var prog = document.getElementById('uploadProgress');
  var basePath = docPath(currentDocRfp.region, currentDocRfp.id);
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    prog.style.display = 'flex';
    prog.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px"></span>&nbsp;Uploading ' + X(file.name) + '…';
    var filePath = basePath + '/' + file.name;
    try {
      var r = await gPut(driveUrl(filePath) + ':/content', file);
      if (!r.ok) { var e2 = await r.json().catch(function(){ return {}; }); throw new Error(e2.error && e2.error.message || 'HTTP ' + r.status); }
      toast('success', 'Uploaded: ' + file.name);
    } catch(err) { toast('error', 'Upload failed (' + file.name + '): ' + err.message); }
  }
  prog.style.display = 'none';
  loadDocList();
}

// Upload files during Add RFP flow (no currentDocRfp yet, pass region + rfpId directly)
async function uploadFilesForNewRfp(files, region, rfpId) {
  if (!isLive || !accessToken) { toast('error', 'Sign in to upload'); return; }
  if (!files.length || !region || !rfpId) return;
  var basePath = docPath(region, rfpId);
  var successCount = 0;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var filePath = basePath + '/' + file.name;
    try {
      var r = await gPut(driveUrl(filePath) + ':/content', file);
      if (!r.ok) { var e2 = await r.json().catch(function(){ return {}; }); throw new Error(e2.error && e2.error.message || 'HTTP ' + r.status); }
      successCount++;
    } catch(err) { toast('error', 'Upload failed (' + file.name + '): ' + err.message); }
  }
  if (successCount > 0) {
    toast('success', 'Uploaded ' + successCount + ' file' + (successCount > 1 ? 's' : '') + ' to OneDrive');
  }
}
