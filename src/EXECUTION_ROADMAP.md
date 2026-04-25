# Execution Roadmap — Hour-by-Hour Breakdown

**Total Estimated Time**: 4-6 hours

---

## Hour 1: Provider Adapter Layer (Core Architecture)

### Task 1.1: Create provider adapter interface
- **File**: `lib/providerAdapter.js`
- **What**: Define the interface that all adapters must implement
- **Deliverable**: Interface stub with all methods (createSession, test, captureRecording, etc.)

### Task 1.2: ScrapingBee Adapter (Easiest)
- **File**: `lib/adapters/scrapingbeeAdapter.js`
- **What**: Minimal wrapper around existing testCredential logic, adapted to new interface
- **Deliverable**: Working adapter that passes a test call

### Task 1.3: Provider Router
- **File**: `lib/selectAdapter.js`
- **What**: Factory function that returns correct adapter based on AppSettings.provider
- **Deliverable**: Router that correctly maps 'scrapingbee' → ScrapingBeeAdapter

---

## Hour 2: Browserless Adapter (WebSocket + Video)

### Task 2.1: Browserless Adapter Shell
- **File**: `lib/adapters/browserlessAdapter.js`
- **What**: Implement createSession (WebSocket connect), test (Puppeteer automation), captureRecording (CDP startRecording/stopRecording), closeSession
- **Key Methods**:
  - `createSession()`: Connect to Browserless WebSocket endpoint
  - `test()`: Puppeteer page automation (fill form, click submit, classify result)
  - `captureRecording()`: Call CDP to get WebM buffer
  - `captureScreenshots()`: Call CDP.send("Page.captureScreenshot")

### Task 2.2: Browserless Integration Test
- **What**: Test Browserless adapter standalone with real credentials (from AppSettings)
- **Expected**: Test succeeds, WebM buffer is returned

---

## Hour 3: Browserbase Adapter (REST Session API + CDP)

### Task 3.1: Browserbase Adapter Shell
- **File**: `lib/adapters/browserbaseAdapter.js`
- **What**: Implement createSession (REST API call), test (Puppeteer over connectUrl), captureRecording (download via API), closeSession
- **Key Methods**:
  - `createSession()`: POST `/v1/sessions`, return session.connectUrl
  - `test()`: Same Puppeteer automation as Browserless
  - `captureRecording()`: GET `/v1/sessions/{id}/recording` → buffer
  - `captureScreenshots()`: Same as Browserless

### Task 3.2: Browserbase Integration Test
- **What**: Test with your Browserbase credentials (project ID from your message)
- **Expected**: Session created, test runs, video downloaded

---

## Hour 4: Refactored testCredential + AppSettings Schema Update

### Task 4.1: Update AppSettings Entity
- **File**: `entities/AppSettings.json`
- **What**: Add provider selection + provider-specific config fields
- **Fields to add**:
  - `provider`: enum (browserbase, browserless, scrapingbee)
  - `browserbase_api_key`, `browserbase_project_id`, `browserbase_region`, etc.
  - `browserless_token`, `browserless_endpoint`, etc.

### Task 4.2: Refactored testCredential Function
- **File**: `functions/testCredential.js` (major rewrite)
- **What**: 
  1. Load settings → select adapter
  2. Create session
  3. Run test
  4. Capture recording (if enabled)
  5. Save to private storage
  6. Cleanup
- **Entry point**: Same HTTP interface, but now provider-agnostic

### Task 4.3: Test All 3 Adapters via testCredential
- **What**: Call testCredential with ScrapingBee, then Browserless, then Browserbase
- **Expected**: All 3 return results with recording_url + screenshots

---

## Hour 5: Frontend UI Updates (Settings)

### Task 5.1: Create ProviderSelector Component
- **File**: `components/settings/ProviderSelector.jsx`
- **What**: Radio buttons to select Browserbase / Browserless / ScrapingBee

### Task 5.2: Create Provider-Specific Settings Components
- **Files**:
  - `components/settings/BrowserbaseSettings.jsx`
  - `components/settings/BrowserlessSettings.jsx`
  - `components/settings/ScrapingBeeSettings.jsx` (existing → extend)
- **What**: Show/hide config fields based on selected provider

### Task 5.3: Update Settings Page
- **File**: `pages/Settings.jsx`
- **What**: Integrate ProviderSelector + conditional settings panels

### Task 5.4: Settings Validation UI
- **What**: "Test Credentials" buttons for each provider
- **Expected**: Toast notifications on success/failure

---

## Hour 6: Frontend UI Updates (Playback) + Final Testing

### Task 6.1: Create Video Player Component
- **File**: `components/playback/VideoPlayer.jsx`
- **What**: HTML5 video player for MP4/WebM with controls

### Task 6.2: Create Screenshot Carousel Component
- **File**: `components/playback/ScreenshotCarousel.jsx`
- **What**: Previous/Next buttons, step label, image display

### Task 6.3: Update RunDetail Page
- **File**: `pages/RunDetail.jsx`
- **What**: Add playback section below status/counters

### Task 6.4: End-to-End Testing
- **What**: Run full workflow for each provider
  1. Create TestRun with 3 credentials
  2. Watch worker process them
  3. Verify recordings + screenshots captured
  4. Click on result to view playback
- **Expected**: All 3 providers show recordings/screenshots

---

## Contingency / Stretch Goals

If finishing early:
- **Add RRWeb playback** for Browserless (requires RRWeb viewer library)
- **Auto-refresh** video player when recording finishes
- **Bulk download** recordings as ZIP
- **Provider stats** dashboard (% usage per provider, avg duration per provider)
- **Detailed logs** tab showing provider-specific events (CDP events, ScrapingBee scenario report, etc.)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Browserbase API takes too long to debug | Start with Browserless (simpler WebSocket) first; come back to Browserbase if time permits |
| WebM/MP4 buffer encoding issues | Test with small binary files first; check Browserless docs for exact encoding |
| ScrapingBee step-screenshot JS injection is slow | Accept single final screenshot initially; add step screenshots as optional feature later |
| Video player doesn't work in UI | Use plain `<video>` tag first; enhance with player library later |
| Signed URLs expire too fast | Cache signed URLs in-memory; regenerate on 403 |

---

## Success Checkpoints

- [ ] **Hour 1**: ScrapingBee adapter working + testCredential dispatches to it
- [ ] **Hour 2**: Browserless adapter tested + returns WebM
- [ ] **Hour 3**: Browserbase adapter tested + returns MP4/WebM
- [ ] **Hour 4**: testCredential works for all 3 + recordings saved to storage
- [ ] **Hour 5**: Settings UI allows provider selection
- [ ] **Hour 6**: PlaybackUI shows recordings/screenshots + end-to-end test passes

---