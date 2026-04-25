// ScrapingBee adapter - stateless pay-per-request browser automation
// Handles login testing via JS scenarios + proxy configuration

export async function testCredentialScrapingBee(apiKey, settings, proxy, site, loginUrl, username, passwords, strategy) {
  // This is a thin wrapper around the testSite logic already in testCredential.js
  // In a full multi-file setup, move testSite/runOne logic here.
  // For now, kept in testCredential.js to avoid circular imports in Deno.
  throw new Error('Use testCredential.js directly for ScrapingBee');
}