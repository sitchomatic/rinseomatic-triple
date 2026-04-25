# Triple-Provider Browser Automation Rewrite — Complete Implementation Plan

**Last Updated:** 2026-04-25 | **Scope:** Full App Rewrite | **Est. Duration:** 4-6 hours

---

## Executive Summary

This document outlines the complete refactor of the Credential Tester app to support three cloud browser providers (Browserbase, Browserless, ScrapingBee) with **equal feature parity**:

- **Provider Selection UI**: Global settings toggle to switch between providers
- **Video Recording**: Native support per provider
  - Browserbase: Automatic video per session (downloaded via API)
  - Browserless: WebM video capture via CDP commands
  - ScrapingBee: Step-by-step screenshots via js_scenario
- **Session Management**: WebSocket (Browserbase/Browserless) + REST (ScrapingBee)
- **Live Debugging**: Real-time session inspection across all providers
- **Self-Hosted Playback**: Video player + screenshot carousel UI
- **Backward Compatibility**: ScrapingBee continues working seamlessly

---

## Phase 1: Research & Architecture Design

### 1.1 Provider Capability Mapping

#### Browserbase (`browserbase`)
| Feature | Status | Implementation |
|---------|--------|-----------------|
| **Session Creation** | ✅ | REST API: `POST /v1/sessions` → `connectUrl` (WebSocket) |
| **Browser Control** | ✅ | Puppeteer/Playwright over WebSocket via `connectUrl` |
| **Video Recording** | ✅ Auto | Automatic per session, viewable in dashboard + downloadable |
| **Video Download** | ✅ | GET `/v1/sessions/{id}/recording` → MP4/WebM (format TBD in docs) |
| **Screenshots** | ✅ | CDP `Page.captureScreenshot` via WebSocket (base64) |
| **Step Screenshots** | ✅ Manual | Take screenshot after each step via CDP |
| **File Downloads** | ✅ | GET `/v1/sessions/{id}/downloads` → ZIP |
| **Session Logs** | ✅ | GET `/v1/sessions/{id}/logs` → CDP event array |
| **Live Debug URL** | ✅ | Available during active session |

**Key Constraints:**
- Recording is **automatic** (no start/stop needed)
- Video format conversion may happen server-side (MP4 transcode optional)
- Recording data structure is RRWeb-based (DOM replay events), but video download is simplest path
- Recording only available during session; after close, video is queryable via API

#### Browserless (`browserless`)
| Feature | Status | Implementation |
|---------|--------|-----------------|
| **Session Creation** | ✅ | WebSocket connection string (no REST session object) |
| **Browser Control** | ✅ | Puppeteer/Playwright over WebSocket |
| **Screen Recording (WebM)** | ✅ Manual | CDP `Browserless.startRecording` / `stopRecording` |
| **Recording Output** | ✅ | Binary WebM file returned directly in CDP response |
| **Screenshots** | ✅ | CDP `Page.captureScreenshot` (base64) |
| **Step Screenshots** | ✅ Manual | Take screenshot after each step |
| **Session Replay (RRWeb)** | ✅ Manual | `replay=true` + `Browserless.stopSessionRecording` |
| **Live Debug** | ❌ | No native dashboard; must use `/livebrowser` URL |

**Key Constraints:**
- **Endpoint**: Must use `/stealth` not `/chrome` for video recording
- **Manual control**: Must call `startRecording` / `stopRecording` explicitly
- **Output**: Binary buffer, must save to file storage
- **Replay mode**: RRWeb data uploaded to Browserless dashboard (not self-hosted)

#### ScrapingBee (`scrapingbee`)
| Feature | Status | Implementation |
|---------|--------|-----------------|
| **Session Creation** | ✅ | REST API (no persistent session; stateless per request) |
| **Browser Control** | ✅ | js_scenario instructions (fill, click, wait, wait_for, scroll, evaluate) |
| **Video Recording** | ❌ | Not supported |
| **Screenshots** | ✅ Single | `screenshot=true` parameter → base64 in response |
| **Step Screenshots** | ✅ Manual | Inject custom JS in js_scenario to return multi-screenshot metadata |
| **Session Logs** | ❌ | No native logs; only js_scenario_report with per-task status |
| **Live Debug** | ❌ | No live session debug |

**Key Constraints:**
- **Stateless**: Each request is independent; no session persistence
- **Single screenshot**: Built-in `screenshot=true` captures only final state
- **Multi-screenshot workaround**: Use `evaluate` instructions to capture intermediate states (e.g., after fill/click, log timestamp + screenshot)
- **Limitation**: No true video; only screenshot carousel

---

### 1.2 Current Codebase Analysis

**Current State: ScrapingBee-Only**
- `testCredential` function: Builds ScrapingBee URL with js_scenario, invokes REST API
- `runWorker` function: Polls queued TestResults, invokes testCredential, updates counters
- `AppSettings` entity: Provider=scrapingbee only
- `TestResult` entity: Has `live_url` field (unused; legacy from Browserless era)
- **Dead Code**: BROWSERLESS_TOKEN secret exists but is unused

**Codebase Advantages:**
- `logEvent()` helper (fire-and-forget logging) is already generic
- Error classification system (transient/blocked/config) is provider-agnostic
- Counter-based run progress tracking is already abstracted

**Refactoring Needs:**
- Decouple `testCredential` into provider-specific handlers
- Abstract WebSocket connection logic (Browserbase/Browserless vs REST)
- Create unified recording/screenshot capture interface
- Add provider detection + routing logic
- Extend `AppSettings` with provider-specific configurations

---

### 1.3 Architecture: Provider Abstraction Layer

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Settings Panel                        │
│  (Global Provider Selector: Browserbase / Browserless /     │
│   ScrapingBee + Provider-Specific Config)                    │
└────────────────┬────────────────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │ AppSettings Entity  │
      │ provider: enum      │
      │ (+ provider-specific│
      │  config fields)     │
      └──────────┬──────────┘
                 │
┌────────────────┴─────────────────────────────────────────────┐
│              Provider Router / Factory                        │
│  (selectProvider() → ProviderAdapter)                         │
└────────────────┬─────────────────────────────────────────────┘
                 │
      ┌──────────┼──────────┬──────────┐
      ▼          ▼          ▼          ▼
  Browserbase  Browserless ScrapingBee (+ others)
   Adapter      Adapter     Adapter
   ┌────────┐  ┌────────┐  ┌────────┐
   │.test() │  │.test() │  │.test() │
   │.record │  │.record │  │.record │
   │.capture│  │.capture│  │.capture│
   │.logs() │  │.logs() │  │.logs() │
   └────────┘  └────────┘  └────────┘
       │          │          │
       └──────────┼──────────┘
                  │
        ┌─────────▼──────────┐
        │   TestResult       │
        │   Screenshot       │
        │   ActionLog        │
        └────────────────────┘
```

---

### 1.4 Data Model Changes

#### AppSettings Schema Updates
```json
{
  "provider": "browserbase|browserless|scrapingbee",
  
  // Common to all
  "timeout_ms": 60000,
  "viewport_width": 1920,
  "viewport_height": 1080,
  
  // Browserbase-specific
  "browserbase_api_key": "...",  // OR use secret
  "browserbase_project_id": "...",
  "browserbase_region": "us-west-2|us-east-1|eu-central-1|ap-southeast-1",
  "browserbase_keep_alive": false,
  "browserbase_capture_video": true,
  "browserbase_capture_logs": true,
  
  // Browserless-specific
  "browserless_token": "...",  // OR use secret
  "browserless_endpoint": "production-sfo|...",
  "browserless_capture_webm": true,
  "browserless_capture_replay": false,  // RRWeb
  "browserless_stealth_proxy": true,
  
  // ScrapingBee-specific (existing fields)
  "proxy_mode": "classic|premium|stealth|external|none",
  "country_code": "au",
  "block_ads": true,
  "block_resources": true,
  "capture_screenshots": true,
  "capture_multi_screenshots": true,  // NEW: step-by-step
}
```

#### TestResult Entity Additions
```json
{
  // Existing fields
  "run_id", "credential_id", "site_key", "username", "status", ...
  
  // NEW: Recording metadata
  "recording_provider": "browserbase|browserless|scrapingbee",
  "recording_session_id": "...",  // Browserbase session ID or Browserless token
  "recording_url": "...",  // Self-hosted video URL or dashboard link
  "recording_file_uri": "...",  // Private storage URI for self-hosted
  "recording_duration_ms": 0,
  "recording_format": "mp4|webm|screenshots",  // What was actually captured
  
  // NEW: Screenshots metadata
  "screenshot_count": 0,
  "screenshots": [
    {
      "step": "initial|after_fill_user|after_fill_pass|after_submit|final",
      "timestamp_ms": 0,
      "image_url": "...",
      "file_uri": "..."
    }
  ]
}
```

#### Screenshot Entity (for self-hosted storage)
```json
{
  "name": "Screenshot",
  "properties": {
    "test_result_id": "string",
    "step_label": "string",
    "order": "number",
    "image_url": "string",
    "file_uri": "string",  // Private storage URI
    "captured_at": "date-time",
    "provider": "browserbase|browserless|scrapingbee"
  }
}
```

---

## Phase 2: Provider Adapter Implementation

### 2.1 Adapter Interface (TypeScript-like pseudo-code)

```typescript
interface ProviderAdapter {
  // Create session / validate credentials
  createSession(config): Promise<SessionHandle>
  
  // Run login automation
  test(
    sessionHandle,
    site,
    username,
    passwords,
    options
  ): Promise<TestResult>
  
  // Capture recording (before session cleanup)
  captureRecording(sessionHandle): Promise<RecordingData>
  
  // Capture screenshots (during or after test)
  captureScreenshots(sessionHandle, steps): Promise<Screenshot[]>
  
  // Retrieve logs
  getLogs(sessionHandle): Promise<LogEntry[]>
  
  // Cleanup
  closeSession(sessionHandle): Promise<void>
}
```

### 2.2 Browserbase Adapter

**Session Handle**: 
```typescript
{
  type: 'browserbase',
  sessionId: string,
  connectUrl: string,
  browser: puppeteer.Browser,
  page: puppeteer.Page
}
```

**Key Implementation Points:**
1. Use `@browserbasehq/sdk` for REST API calls (session creation)
2. Use Puppeteer (already installed) to connect via `connectUrl`
3. Screenshots: Use CDP `Page.captureScreenshot` (base64 → save to private storage)
4. Recording: Automatic; download via GET `/v1/sessions/{id}/recording` after session close
5. Video format: Request MP4 if available, fallback to WebM
6. Logs: Optional; retrieve via GET `/v1/sessions/{id}/logs`

**Pseudocode**:
```javascript
async function createBrowserbaseSession(config) {
  const bb = new Browserbase({ apiKey: config.api_key });
  const session = await bb.sessions.create({
    projectId: config.project_id,
    region: config.region || 'us-west-2',
    keepAlive: false,
    browserSettings: {
      viewport: {
        width: config.viewport_width || 1920,
        height: config.viewport_height || 1080
      }
    }
  });
  
  const browser = await puppeteer.connect({
    browserWSEndpoint: session.connectUrl
  });
  
  return {
    type: 'browserbase',
    sessionId: session.id,
    connectUrl: session.connectUrl,
    browser,
    apiKey: config.api_key
  };
}
```

### 2.3 Browserless Adapter

**Session Handle**:
```typescript
{
  type: 'browserless',
  wsEndpoint: string,
  browser: puppeteer.Browser,
  page: puppeteer.Page,
  recordingBuffer: Buffer | null
}
```

**Key Implementation Points:**
1. No session creation; connect directly to WebSocket endpoint
2. Construct endpoint: `wss://production-sfo.browserless.io?token=TOKEN&headless=false&stealth=true&record=true`
3. Screenshots: CDP `Page.captureScreenshot` → base64
4. Recording: Call `cdp.send("Browserless.startRecording")` before automation, `stopRecording` after
5. RRWeb replay: Optional `replay=true` + `stopSessionRecording` (uploads to Browserless dashboard)
6. Save WebM buffer to private storage

**Pseudocode**:
```javascript
async function createBrowserlessSession(config) {
  const wsEndpoint = `wss://${config.endpoint || 'production-sfo'}.browserless.io?token=${config.token}&headless=false&stealth=true&record=true`;
  
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint
  });
  
  const page = await browser.newPage();
  await page.setViewport({
    width: config.viewport_width || 1920,
    height: config.viewport_height || 1080
  });
  
  const cdp = await page.createCDPSession();
  await cdp.send('Browserless.startRecording');
  
  return {
    type: 'browserless',
    wsEndpoint,
    browser,
    page,
    cdp,
    recordingBuffer: null
  };
}

async function stopBrowserlessRecording(handle) {
  const response = await handle.cdp.send('Browserless.stopRecording');
  handle.recordingBuffer = Buffer.from(response.value, 'binary');
  return handle.recordingBuffer;
}
```

### 2.4 ScrapingBee Adapter

**Session Handle**:
```typescript
{
  type: 'scrapingbee',
  apiKey: string,
  screenshots: { step, base64 }[]
}
```

**Key Implementation Points:**
1. No persistent session; stateless REST API
2. Inject screenshot capture into js_scenario via `evaluate` instructions
3. Custom approach: After each login step, execute JS to capture viewport as canvas → DataURL
4. ScrapingBee's native `screenshot=true` captures only final state; supplement with step captures
5. Store all base64 images as private files

**Pseudocode**:
```javascript
function buildScrapingBeeScenarioWithScreenshots(site, username, password) {
  const instructions = [
    { wait_for: userSel },
    { fill: [userSel, username] },
    { evaluate: 'window.__screenshots = window.__screenshots || []; window.__screenshots.push({step: "after_fill_user", data: await captureScreenshot()})' },
    { fill: [passSel, password] },
    { evaluate: 'window.__screenshots.push({step: "after_fill_pass", data: await captureScreenshot()})' },
    { click: submitSel },
    { wait: 3500 },
    { evaluate: 'window.__screenshots.push({step: "final", data: await captureScreenshot()})' }
  ];
  
  return {
    strict: false,
    instructions,
    // Also request native screenshot
    screenshot: true
  };
}

// Extract screenshots from js_scenario_report.tasks
// (Each evaluate task can return custom data)
```

---

## Phase 3: Backend Function Refactor

### 3.1 New testCredential Architecture

**Old**: Single monolithic function handling only ScrapingBee

**New**: Multi-provider dispatcher
```
testCredential (entry point)
  ├─ Load settings → determine provider
  ├─ Select adapter
  ├─ Call adapter.test()
  ├─ Capture recording / screenshots
  ├─ Save to private storage
  ├─ Return result + metadata
```

**Pseudocode**:
```javascript
async function testCredential(req) {
  // 1. Load provider
  const settings = await loadSettings(base44);
  const adapter = selectAdapter(settings.provider);
  
  // 2. Create session
  const sessionHandle = await adapter.createSession(settings);
  
  // 3. Run test
  const testResult = await adapter.test(
    sessionHandle,
    site,
    username,
    passwords,
    { strategy, maxRetries, ... }
  );
  
  // 4. Capture recording (after test, before cleanup)
  let recording = null;
  if (settings.capture_video) {
    recording = await adapter.captureRecording(sessionHandle);
    if (recording) {
      const uri = await uploadPrivateFile(recording.buffer, recording.filename);
      testResult.recording_url = await createSignedUrl(uri);
      testResult.recording_file_uri = uri;
      testResult.recording_format = recording.format; // mp4|webm
    }
  }
  
  // 5. Capture screenshots
  let screenshots = [];
  if (settings.capture_screenshots) {
    screenshots = await adapter.captureScreenshots(sessionHandle);
    for (const screenshot of screenshots) {
      const uri = await uploadPrivateFile(screenshot.buffer, ...);
      screenshot.file_uri = uri;
      screenshot.image_url = await createSignedUrl(uri);
    }
    testResult.screenshots = screenshots;
  }
  
  // 6. Cleanup
  await adapter.closeSession(sessionHandle);
  
  return testResult;
}
```

### 3.2 New runWorker Architecture

**No major changes** — it's already provider-agnostic. It:
1. Fetches queued TestResults
2. Calls testCredential (which now handles all providers)
3. Updates TestResult + TestRun counters
4. Retries on transient errors

---

### 3.3 New Settings Functions

Create backend functions to:
1. **`validateBrowserbaseCredentials`** — Test API key + project ID
2. **`validateBrowserlessToken`** — Test token + endpoint
3. **`validateScrapingBeeKey`** — Test API key (existing)

---

## Phase 4: Frontend Changes

### 4.1 Settings UI Updates

**New Components:**
1. **ProviderSelector** — Radio buttons: Browserbase / Browserless / ScrapingBee
2. **BrowserbaseSettings** — API key, project ID, region, keepAlive toggle, video capture toggle
3. **BrowserlessSettings** — Token, endpoint, stealth proxy toggle, WebM capture toggle, RRWeb replay toggle
4. **ScrapingBeeSettings** — (existing) proxy mode, country, block ads, etc. + step-screenshot toggle
5. **RecordingSettings** — Global: capture_video (bool), auto-upload (bool), retention_days (number)

**UI Flow:**
```
Settings Page
└─ Provider Selection
   ├─ Browserbase (if selected)
   │  ├─ API Key Input
   │  ├─ Project ID Input
   │  ├─ Region Select
   │  ├─ Keep Alive Toggle
   │  ├─ Capture Video Toggle
   │  ├─ Capture Logs Toggle
   │  └─ Test Credentials Button
   │
   ├─ Browserless (if selected)
   │  ├─ API Token Input
   │  ├─ Endpoint Select
   │  ├─ Stealth Proxy Toggle
   │  ├─ Capture WebM Toggle
   │  ├─ Capture RRWeb Toggle
   │  └─ Test Credentials Button
   │
   └─ ScrapingBee (if selected)
      ├─ API Key Input (existing)
      ├─ Proxy Mode Select (existing)
      ├─ ... (existing fields)
      ├─ Capture Step Screenshots Toggle (NEW)
      └─ Test Credentials Button
```

### 4.2 TestResult / RunDetail UI Updates

**New Playback Section** (after status/counters):
```
Recording & Screenshots
├─ Video Player (if mp4/webm available)
│  ├─ Duration
│  ├─ Play/Pause/Speed Controls
│  └─ Full-screen Toggle
│
└─ Screenshots Carousel (if screenshots available)
   ├─ Step Label (initial / after_fill_user / ... / final)
   ├─ Timestamp
   ├─ Image Display
   ├─ Previous / Next Buttons
   └─ Download Button (per screenshot)
```

### 4.3 RunCard / Dashboard Updates

**Provider Badge**: Small label showing which provider was used
```
Run Card
├─ Label
├─ Provider Badge (Browserbase | Browserless | ScrapingBee)
├─ Status
├─ Counters
├─ Recording Indicator (🎬 if video, 📸 if screenshots)
└─ Link to Details
```

---

## Phase 5: Storage & File Management

### 5.1 Private File Upload Strategy

**For WebM/MP4 videos and screenshots:**
1. Use `base44.integrations.Core.UploadPrivateFile()` (if available) or REST endpoint
2. Store in private storage (not public)
3. Generate signed URL for playback (expires in 24-48 hours)
4. Store signed URL in TestResult for immediate access
5. Store file_uri for re-signing if URL expires

**File Naming Convention:**
```
browserbase_{sessionId}_{testResultId}.mp4
browserless_{sessionId}_{testResultId}.webm
scrapingbee_{step}_{testResultId}.png
```

### 5.2 Cleanup Strategy

**Retention Policy** (configurable in AppSettings):
- Videos: 30 days (default)
- Screenshots: 30 days (default)
- Logs: 7 days (default)

**Cleanup Automation**:
Create a scheduled function `cleanupOldRecordings()` that runs daily:
```javascript
async function cleanupOldRecordings() {
  const retention = settings.recording_retention_days || 30;
  const cutoff = new Date(Date.now() - retention * 86400000);
  
  const oldResults = await TestResult.filter({
    tested_at: { $lt: cutoff.toISOString() },
    recording_file_uri: { $exists: true }
  });
  
  for (const result of oldResults) {
    // Delete file_uri from private storage
    await deletePrivateFile(result.recording_file_uri);
    
    // Clear the reference
    await TestResult.update(result.id, {
      recording_file_uri: null,
      recording_url: null
    });
  }
}
```

---

## Phase 6: Testing & Deployment

### 6.1 Test Matrix

| Provider | Test Case | Expected Outcome |
|----------|-----------|-----------------|
| Browserbase | Run single credential | ✅ Video + screenshots captured |
| Browserbase | Test with RRWeb replay | ✅ Dashboard link available |
| Browserless | Run single credential | ✅ WebM video captured |
| Browserless | Multi-screenshot mode | ✅ Screenshots at each step |
| Browserless | With stealth proxy | ✅ Connection succeeds |
| ScrapingBee | Single credential | ✅ Final screenshot captured |
| ScrapingBee | Step screenshot mode | ✅ Multi-step screenshots in carousel |
| ScrapingBee | External proxy | ✅ Proxy respected |
| Multi-provider | Switch providers mid-run | ✅ No data corruption |

### 6.2 Deployment Checklist

- [ ] Add secrets: `BROWSERBASE_API_KEY`, `BROWSERLESS_TOKEN`
- [ ] Migrate AppSettings entity (add new fields)
- [ ] Deploy adapter implementations
- [ ] Deploy new testCredential + runWorker
- [ ] Update UI components
- [ ] Test end-to-end (all 3 providers)
- [ ] Monitor for errors (check ActionLog)
- [ ] Document provider-specific gotchas in UI

---

## Phase 7: Gotchas & Considerations

### 7.1 Browserbase Gotchas

1. **Recording availability**: Automatic; no explicit start/stop needed
2. **Video format**: May require format conversion (MP4 transcode optional; default is WebM)
3. **Session limits**: Concurrency limits depend on plan (check Hobby vs Pro)
4. **Region selection**: Latency + residual IP depend on region choice
5. **Data retention**: Recordings auto-delete after ~30 days (check dashboard)

### 7.2 Browserless Gotchas

1. **Endpoint requirement**: Must use `/stealth` for video recording, not `/chrome`
2. **Recording manual control**: Must explicitly call `startRecording` / `stopRecording`
3. **Binary buffer encoding**: `Buffer.from(response.value, 'binary')` is critical
4. **RRWeb vs Video**: Two separate features; both can be enabled simultaneously
5. **Rate limits**: Paid plans have concurrency caps (check subscription)

### 7.3 ScrapingBee Gotchas

1. **No persistent sessions**: Each request is independent; no multi-step context
2. **Single native screenshot**: `screenshot=true` captures only final state
3. **Step screenshots**: Require custom JS injection via `evaluate` instructions
4. **No video output**: Multi-screenshot carousel is the "video" equivalent
5. **Strict mode failures**: If an intermediate step fails (e.g., selector not found), entire scenario aborts unless `strict: false`

### 7.4 Cross-Provider Gotchas

1. **Switching providers mid-run**: Old TestResults won't have recording_provider field → migrations needed
2. **API key storage**: Use Base44 secrets, not plaintext in AppSettings
3. **Session cleanup**: Browserless/Browserbase sessions auto-timeout; ScrapingBee has none
4. **Timeout semantics**: Each provider has different timeout behaviors (clamp to max)
5. **Proxy handling**: Browserbase uses its own proxy service; Browserless uses external proxies; ScrapingBee uses rotating pool

---

## Phase 8: Implementation Sequence (Actual Work Order)

**Week 1: Backend Refactor**
1. Create provider adapter interface (lib/providerAdapter.js)
2. Implement BrowserbaseAdapter
3. Implement BrowserlessAdapter
4. Refactor testCredential to use adapters
5. Update AppSettings entity schema
6. Create validation functions (validateBrowserbaseCredentials, etc.)

**Week 1-2: File Storage & Recording**
7. Implement private file upload wrapper
8. Implement signed URL generation
9. Implement screenshot/video persistence
10. Create cleanupOldRecordings scheduled function

**Week 2: Frontend Updates**
11. Create ProviderSelector component
12. Create BrowserbaseSettings component
13. Create BrowserlessSettings component
14. Update ScrapingBeeSettings component
15. Create video player component
16. Create screenshot carousel component
17. Update RunDetail page

**Week 2-3: Testing & Polish**
18. End-to-end testing (all 3 providers)
19. Error handling & edge cases
20. Documentation & deployment

---

## Success Criteria

- ✅ All 3 providers fully functional
- ✅ Video recording works for Browserbase & Browserless
- ✅ Step-screenshot carousel works for ScrapingBee
- ✅ Provider switching doesn't corrupt data
- ✅ Signed URLs for videos/screenshots work
- ✅ Cleanup automation runs daily
- ✅ UI clearly shows which provider is in use
- ✅ ScrapingBee continues to work seamlessly
- ✅ No breaking changes to existing TestResult/TestRun data
- ✅ Dashboard/audit logs capture provider info

---

## Notes for Developer

1. **Start with ScrapingBee adapter**: It's the simplest (no WebSocket, REST-only)
2. **Then Browserless**: WebSocket is straightforward; video capture is explicit
3. **Finally Browserbase**: Most complex (async session creation, video download after close)
4. **Test incrementally**: Don't try to complete all 3 at once; test each adapter as you build it
5. **Use ActionLog extensively**: Fire-and-forget logging will help debug provider-specific issues
6. **Secrets management**: Use Base44 secrets for all API keys (don't hardcode in entities)
7. **Error messages**: Include provider name in all errors so user knows which provider failed

---

**End of Implementation Plan**