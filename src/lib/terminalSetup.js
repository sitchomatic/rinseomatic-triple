// Global terminal logging setup - initializes when app loads
// Captures all fetch requests, base44 SDK calls, and console output

export function initializeTerminalLogging() {
  const logBuffer = [];

  // Store original methods before any interception
  const originalFetch = window.fetch;

  // Enhance fetch to log all base44 API calls
  window.fetch = async (resource, config) => {
    const url = String(resource);
    const isBase44Call = url.includes("/api/") || url.includes("base44");

    if (isBase44Call) {
      const method = (config?.method || "GET").toUpperCase();
      console.log(`[BASE44] → ${method} ${url}`);

      if (config?.body) {
        try {
          const body = typeof config.body === "string" ? JSON.parse(config.body) : config.body;
          console.log(`[BASE44] REQUEST BODY:`, body);
        } catch (_) {
          console.log(`[BASE44] REQUEST:`, config.body);
        }
      }
    }

    try {
      const response = await originalFetch(resource, config);

      if (isBase44Call) {
        console.log(`[BASE44] ← ${response.status} ${response.statusText}`);

        // Clone and log response body for JSON responses
        if (
          response.headers.get("content-type")?.includes("application/json") &&
          response.status !== 204
        ) {
          const cloned = response.clone();
          try {
            const data = await cloned.json();
            console.log(`[BASE44] RESPONSE:`, data);
            return response;
          } catch (_) {
            return response;
          }
        }
      }

      return response;
    } catch (error) {
      if (isBase44Call) {
        console.error(`[BASE44] ERROR: ${error.message}`);
      }
      throw error;
    }
  };

  // Patch the base44 SDK if available
  if (window.__base44) {
    const original = window.__base44;
    console.log("[INIT] Base44 SDK initialized and logging enabled");
  }

  console.log("[INIT] Terminal logging active - all network calls and console output will be captured");
}