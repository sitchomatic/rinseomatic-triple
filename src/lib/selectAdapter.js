import { ScrapingBeeAdapter } from './adapters/scrapingbeeAdapter.js';
import { BrowserlessAdapter } from './adapters/browserlessAdapter.js';
import { BrowserbaseAdapter } from './adapters/browserbaseAdapter.js';

/**
 * Select the appropriate provider adapter based on AppSettings.provider
 * 
 * @param {string} provider - 'scrapingbee' | 'browserless' | 'browserbase'
 * @returns {ProviderAdapter} Adapter instance
 * @throws {Error} If provider is unknown or not yet implemented
 */
export function selectAdapter(provider) {
  switch (provider) {
    case 'scrapingbee':
      return new ScrapingBeeAdapter();
    case 'browserless':
      return new BrowserlessAdapter();
    case 'browserbase':
      return new BrowserbaseAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}