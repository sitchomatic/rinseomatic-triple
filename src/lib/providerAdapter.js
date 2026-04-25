/**
 * Provider Adapter Interface
 * 
 * All browser automation providers (Browserbase, Browserless, ScrapingBee)
 * must implement this interface to ensure consistent behavior across the app.
 */

export class ProviderAdapter {
  /**
   * Create a new browser session.
   * Returns a provider-specific session handle that's passed to other methods.
   * 
   * @param {Object} config - Provider config from AppSettings
   * @returns {Promise<Object>} Session handle (structure varies by provider)
   */
  async createSession(config) {
    throw new Error('createSession not implemented');
  }

  /**
   * Test a single login attempt against a site.
   * 
   * @param {Object} sessionHandle - From createSession()
   * @param {Object} site - Site entity
   * @param {string} username - Username/email
   * @param {string} password - Password to try
   * @param {Object} options - { timeout_ms, viewport_width, viewport_height, ... }
   * @returns {Promise<Object>} { status: 'working'|'failed'|'error', final_url, success_marker_found, error_message?, elapsed_ms }
   */
  async test(sessionHandle, site, username, password, options) {
    throw new Error('test not implemented');
  }

  /**
   * Capture video/recording of the session (if supported).
   * Called after test() but before closeSession().
   * 
   * @param {Object} sessionHandle - From createSession()
   * @returns {Promise<Object|null>} { buffer: Buffer, filename: string, format: 'mp4'|'webm'|null } or null if not supported
   */
  async captureRecording(sessionHandle) {
    throw new Error('captureRecording not implemented');
  }

  /**
   * Capture screenshots at specific steps.
   * Called after test() but before closeSession().
   * 
   * @param {Object} sessionHandle - From createSession()
   * @param {Array} steps - [{ step: 'initial'|'after_fill_user'|'after_submit'|'final', description: '...' }]
   * @returns {Promise<Array>} [{ step, buffer: Buffer, filename: string }, ...]
   */
  async captureScreenshots(sessionHandle, steps) {
    throw new Error('captureScreenshots not implemented');
  }

  /**
   * Retrieve logs/events from the session (if supported).
   * 
   * @param {Object} sessionHandle - From createSession()
   * @returns {Promise<Array>} Log entries
   */
  async getLogs(sessionHandle) {
    throw new Error('getLogs not implemented');
  }

  /**
   * Close the session and cleanup resources.
   * 
   * @param {Object} sessionHandle - From createSession()
   * @returns {Promise<void>}
   */
  async closeSession(sessionHandle) {
    throw new Error('closeSession not implemented');
  }
}