// auth.js — MSAL authentication lifecycle (init, sign-in, sign-out, token acquisition)
var msalApp     = null;
var accessToken = null;
var currentAcct = null;
var isLive      = false;

async function init() {
  updateSnapshot();
  showUnauthenticated();

  // Create MSAL instance (v2 — no initialize() call)
  try {
    msalApp = new msal.PublicClientApplication(MSAL_CONFIG);
  } catch(e) {
    console.error('[MSAL] init failed:', e);
    return;
  }

  // Consume any redirect response
  var redirect = null;
  try {
    redirect = await msalApp.handleRedirectPromise();
  } catch(e) {
    console.warn('[MSAL] handleRedirectPromise error (clearing cache):', e);
    localStorage.clear();
    return;
  }

  if (redirect && redirect.accessToken) {
    accessToken = redirect.accessToken;
    currentAcct = redirect.account;
    applyUserUI(currentAcct);
    await loadLiveData();
    return;
  }

  // Check for cached account
  var accts = msalApp.getAllAccounts();
  if (accts.length > 0) {
    currentAcct = accts[0];
    applyUserUI(currentAcct);
    try {
      var tr = await msalApp.acquireTokenSilent({ scopes: SCOPES, account: currentAcct });
      accessToken = tr.accessToken;
      await loadLiveData();
    } catch(e) {
      console.warn('[MSAL] silent token failed:', e.message);
      showUnauthenticated();
    }
  }
}

function showUnauthenticated() {
  isLive = false;
  document.getElementById('staticBanner').style.display = 'flex';
  document.getElementById('signInPrompt').style.display = 'flex';
  document.getElementById('btnSignIn').style.display = '';
  document.getElementById('btnSignOut').style.display = 'none';
  setStatus('static', 'Not signed in');
  renderAll([]);
}

function applyUserUI(acct) {
  var email = acct.username || acct.name || '';
  document.getElementById('headerUser').textContent = email;
  document.getElementById('btnSignIn').style.display = 'none';
  document.getElementById('btnSignOut').style.display = '';
  document.getElementById('signInPrompt').style.display = 'none';
  document.getElementById('staticBanner').style.display = 'none';
}

function updateSnapshot() {
  var d = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  document.getElementById('headerSnapshot').textContent = 'Snapshot: ' + d;
}

function setStatus(mode, msg) {
  document.getElementById('statusDot').className = 'status-dot' + (mode === 'live' ? '' : ' static');
  document.getElementById('statusText').textContent = msg;
}

async function signIn() {
  if (!msalApp) {
    toast('error', 'Auth not ready — please refresh the page (F5).');
    return;
  }
  try {
    await msalApp.loginRedirect({ scopes: SCOPES });
  } catch(e) {
    console.error('[MSAL] loginRedirect failed:', e);
    toast('error', 'Sign-in error: ' + e.message);
  }
}

function signOut() {
  if (msalApp && currentAcct) {
    msalApp.logoutRedirect({ account: currentAcct });
  }
}

async function getToken() {
  if (!msalApp || !currentAcct) return null;
  try {
    var r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account: currentAcct });
    return r.accessToken;
  } catch(e) {
    console.warn('[MSAL] silent token failed, trying redirect:', e.message);
    try { await msalApp.acquireTokenRedirect({ scopes: SCOPES, account: currentAcct }); }
    catch(e2) { console.error('[MSAL] acquireTokenRedirect failed:', e2); }
    return null;
  }
}

async function refreshLive() {
  if (!msalApp) { toast('error', 'Auth not ready — please refresh the page (F5).'); return; }
  if (!currentAcct) { signIn(); return; }
  var tk = await getToken();
  if (!tk) return;
  accessToken = tk;
  await loadLiveData();
}

window.addEventListener('DOMContentLoaded', init);
