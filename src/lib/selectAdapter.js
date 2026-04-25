/**
 * Provider adapter factory - routes to appropriate implementation
 * Note: Current dispatcher in testCredential.js handles routing directly
 * This is kept as a utility for future refactoring
 * 
 * @param {string} provider - 'scrapingbee' | 'browserless' | 'browserbase'
 * @returns {Object} Provider metadata
 * @throws {Error} If provider is unknown
 */
export function selectAdapter(provider) {
  switch (provider) {
    case 'scrapingbee':
      return { type: 'scrapingbee', name: 'ScrapingBee', status: 'active' };
    case 'browserless':
      return { type: 'browserless', name: 'Browserless', status: 'in-development' };
    case 'browserbase':
      return { type: 'browserbase', name: 'Browserbase', status: 'in-development' };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}