// config.js — MSAL configuration, SharePoint IDs, and application constants
var MSAL_CONFIG = {
  auth: {
    clientId: '985c0a27-6dfb-4db4-a5f2-89063e62786d',
    authority: 'https://login.microsoftonline.com/da51236c-673f-4088-b303-6ed33f5d7cbb',
    redirectUri: 'https://presales-dashboard-rho.vercel.app'
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true }
};
var SCOPES = ['Sites.ReadWrite.All', 'Files.ReadWrite', 'User.Read'];

var SP_SITE_ID  = '8d80a518-b3c8-45d3-80e6-d077a3e8e0bd';
var SP_LIST_ID  = '2951b765-1c2f-48f1-83ce-54d53ca3ebb3';
var SP_GAPS_ID    = '563a0568-9439-457e-89e1-3979a7d5dea6';
var SP_ACTIONS_ID = ''; // TODO: paste SharePoint "RFP Actions" list ID here
var SP_HOST       = 'saintsandmastersglobal.sharepoint.com';

var GRAPH = 'https://graph.microsoft.com/v1.0';

// OneDrive folder at root of user's drive (RFP Documents/{Country}/{RFP-ID}/)
var ONEDRIVE_BASE = 'RFP Documents';

// Blocking categories (used in form dropdowns and gap analysis)
var BLOCKING_CATEGORIES = [
  'OEM & Authorization Gaps',
  'Past Performance & Reference Gaps',
  'Compliance & Certification Gaps',
  'Local Presence & Data Residency Gaps',
  'Portal & Administrative Gaps',
  'Commercial & Technical Capability Gaps',
  'Supply Chain & Pricing Gaps'
];

// Action type choices (for RFP activity timeline)
var ACTION_TYPES = [
  'Update',
  'Call',
  'Meeting',
  'Submission',
  'Document',
  'Review',
  'Query',
  'Note'
];

// Division choices
var DIVISIONS = ['CEE Division', 'India Division', 'SEA Division'];

// Submission status choices
var SUBMISSION_STATUSES = ['In Progress', 'Submitted', 'Not Submitted', 'Dropped'];

// Opportunity status choices
var OPPORTUNITY_STATUSES = ['In Progress', 'Won', 'Lost', 'Dropped'];
