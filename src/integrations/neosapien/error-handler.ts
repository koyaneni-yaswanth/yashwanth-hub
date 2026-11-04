// NeoSapien Integration: Error Handler & Diagnostics

export class NeoIntegrationError extends Error {
  public code: string;
  public resolutionHint: string;
  public recoverable: boolean;

  constructor(message: string, code: string, resolutionHint: string, recoverable: boolean = true) {
    super(message);
    this.name = 'NeoIntegrationError';
    this.code = code;
    this.resolutionHint = resolutionHint;
    this.recoverable = recoverable;
  }
}

export class NeoAuthError extends NeoIntegrationError {
  constructor(message: string = 'NeoSapien authentication or token validation failed.') {
    super(
      message,
      'NEO_AUTH_FAILED',
      'Verify the Bearer secret or access credentials configured for NeoSapien in Settings.',
      false
    );
    this.name = 'NeoAuthError';
  }
}

export class NeoMcpError extends NeoIntegrationError {
  constructor(message: string = 'Failed to connect to configured MCP server endpoint.') {
    super(
      message,
      'NEO_MCP_UNREACHABLE',
      'Note: NeoSapien (neosapien.ai) does not host an open public cloud MCP server. Verify your custom/local SSE proxy endpoint.',
      true
    );
    this.name = 'NeoMcpError';
  }
}

export class NeoPayloadError extends NeoIntegrationError {
  constructor(message: string = 'Invalid memory payload structure.') {
    super(
      message,
      'NEO_INVALID_PAYLOAD',
      'Ensure the JSON export or webhook payload adheres to the canonical NeoMemory format with title and capturedAt.',
      false
    );
    this.name = 'NeoPayloadError';
  }
}

export class NeoBleError extends NeoIntegrationError {
  constructor(message: string = 'Web Bluetooth LE connection failed.') {
    super(
      message,
      'NEO_BLE_UNAVAILABLE',
      'Ensure Neo 1 wearable is charged, in pairing mode, and Web Bluetooth is enabled in your browser.',
      true
    );
    this.name = 'NeoBleError';
  }
}
