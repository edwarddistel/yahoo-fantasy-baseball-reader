/** Errors are intentionally concise: never embed OAuth tokens or complete Yahoo responses. */
export class ConfigurationError extends Error {
  constructor(message) { super(message); this.name = 'ConfigurationError'; }
}

export class YahooApiError extends Error {
  constructor(message, { status, resource } = {}) {
    super(message);
    this.name = 'YahooApiError';
    this.status = status;
    this.resource = resource;
  }
}

export class YahooAuthError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'YahooAuthError';
    this.status = status;
  }
}
