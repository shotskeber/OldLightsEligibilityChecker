export function getConfigStatus(config) {
  const missingFields = [];

  if (!config.clientId) {
    missingFields.push('NEXT_PUBLIC_BUNGIE_CLIENT_ID');
  }

  if (!config.apiKey) {
    missingFields.push('NEXT_PUBLIC_BUNGIE_API_KEY');
  }

  return {
    isReady: missingFields.length === 0,
    missingFields,
    callbackUrl: new URL('/', config.appUrl).toString(),
  };
}
