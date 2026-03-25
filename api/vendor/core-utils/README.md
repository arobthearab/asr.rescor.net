# @rescor/core-utils

> Shared utilities for RESCOR projects: event logging, path operations, file uploads, and more

**Version**: 1.0.0
**License**: UNLICENSED (Private)
**Node**: ≥ 18.0.0

## Features

- 📝 **Recorder**: Event-driven logging system with severity levels and event codes
- 📂 **Utilities**: Path normalization, user detection, sensitive data masking
- 📤 **UploadObject**: Promise-based file upload handling with CGI/HTTP support
- 🔐 **Security**: Automatic credential masking in logs and error messages
- ⚡ **Performance**: Efficient file operations and stream management
- 🎯 **TypeSafe**: Full JSDoc annotations for editor support
- 🩺 **VitalSigns**: Plan-driven service lifecycle orchestration (`start`/`check`/`stop`/`force`)

## Installation

```bash
# From workspace root
npm install

# The package is part of the @rescor monorepo workspace
# It is automatically linked to other @rescor packages
```

## Quick Start

### Event Logging with Recorder

```javascript
import { Recorder } from '@rescor/core-utils';

// Create recorder
const recorder = new Recorder({
  logLevel: 'info',              // Minimum severity: 'debug'|'info'|'warning'|'error'
  eventCodeFormat: '6-digit',    // Event code format
  outputFile: './logs/app.log'   // Optional file output
});

// Emit events
recorder.emit(1000, 'i', 'Application started');
recorder.emit(1001, 'w', 'Configuration missing', { key: 'API_KEY' });
recorder.emit(1002, 'e', 'Database connection failed', { error: err.message });

// Close recorder
recorder.close();
```

### Service Lifecycle with VitalSigns

```javascript
import {
  VitalSign,
  VitalSigns,
  createDockerComposeServiceSign,
  getEnvNumber,
  getEnvString,
  isTcpPortReachable
} from '@rescor/core-utils';

const apiHost = getEnvString('APP_API_HOST', '127.0.0.1');
const apiPort = getEnvNumber('APP_API_PORT', 3001);

const services = new VitalSigns({
  plans: {
    start: [
      { service: 'keycloak', action: 'start' },
      { service: 'api', action: 'start' }
    ],
    status: [
      { service: 'keycloak', action: 'check' },
      { service: 'api', action: 'check' }
    ]
  },
  signs: [
    createDockerComposeServiceSign({
      name: 'keycloak',
      host: '127.0.0.1',
      port: 8080,
      cwd: process.cwd(),
      startServices: ['keycloak'],
      stopServices: ['keycloak', 'keycloak-postgres']
    }),
    new VitalSign('api', {
      check: async () => {
        const ok = await isTcpPortReachable({ host: apiHost, port: apiPort });
        return ok ? { state: 'success' } : { state: 'hard-fail', message: 'API not reachable' };
      }
    })
  ]
});

await services.run('status');
```

### Path Operations

```javascript
import { Utilities } from '@rescor/core-utils';

// Normalize paths (convert backslashes, resolve ..)
const normalized = Utilities.NormalizePath('C:\\Users\\..\\data\\file.txt');
// → '/Users/data/file.txt' (Unix-style)

// Get canonical absolute path
const canonical = Utilities.CanonicalPath('./relative/path');
// → '/absolute/path/to/relative/path'

// Compare paths (platform-aware)
const same = Utilities.PathsEqual('/path/to/file', '/PATH/TO/FILE');
// → true (on case-insensitive systems)

// Match path patterns
const matches = Utilities.MatchPath('/app/src/index.js', '/app/src/*.js');
// → true

// List files in directory
const files = await Utilities.ListFiles('/app/src', {
  recursive: true,
  pattern: '*.js'
});
```

### User Detection

```javascript
import { Utilities } from '@rescor/core-utils';

// Detect user from x.509 certificate (Apache SSL_CLIENT_S_DN)
const user1 = Utilities.getUserFromCertificate('/CN=john.doe@example.com/...');
// → 'john.doe'

// Detect user from HTTP headers (REMOTE_USER)
const user2 = Utilities.getUserFromHeaders({
  'remote-user': 'jane.smith@example.com'
});
// → 'jane.smith'

// Get current user (process.env.USER fallback)
const user3 = Utilities.getCurrentUser();
// → 'current_username'
```

### Sensitive Data Masking

```javascript
import { Utilities } from '@rescor/core-utils';

// Mask credentials in strings
const sql = 'DATABASE=TESTDB;UID=admin;PWD=secret123';
const masked = Utilities.maskSensitiveData(sql);
// → 'DATABASE=TESTDB;UID=***MASKED***;PWD=***MASKED***'

// Configure custom sensitive fields
const config = {
  sensitiveFields: ['apiKey', 'token', 'secret']
};
const masked2 = Utilities.maskSensitiveData('apiKey=abc123 token=xyz789', config);
// → 'apiKey=***MASKED*** token=***MASKED***'
```

### File Upload Handling

```javascript
import { UploadObject } from '@rescor/core-utils';
import { Recorder } from '@rescor/core-utils';

const recorder = new Recorder({ logLevel: 'info' });

// Create upload handler
const uploader = new UploadObject({
  uploadDir: '/app/uploads',
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  allowedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
  recorder
});

// Handle upload (Express/HTTP server)
app.post('/upload', async (req, res) => {
  try {
    const files = await uploader.upload(req);

    res.json({
      success: true,
      files: files.map(f => ({
        filename: f.filename,
        size: f.size,
        path: f.path
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Handle CGI upload
if (process.env.GATEWAY_INTERFACE) {
  const files = await uploader.uploadFromCGI();
  console.log('Uploaded files:', files);
}
```

## API Documentation

### Recorder

Event-driven logging system.

#### Constructor Options

```javascript
new Recorder({
  logLevel: 'debug|info|warning|error',  // Minimum severity (default: 'info')
  eventCodeFormat: '6-digit|legacy',     // Event code format (default: '6-digit')
  outputFile: string,                    // Optional log file path
  console: boolean                       // Log to console (default: true)
})
```

#### Event Severity Levels

- `'d'` or `'debug'` - Debug information (verbose)
- `'i'` or `'info'` - Informational messages
- `'w'` or `'warning'` - Warning messages
- `'e'` or `'error'` - Error messages

#### Methods

- `emit(code, level, message, data)` - Emit event
  - `code` (number): Event code (e.g., 1000)
  - `level` (string): Severity level ('d'|'i'|'w'|'e')
  - `message` (string): Event message
  - `data` (object): Additional context data (optional)

- `close()` - Close log file stream and cleanup

- `getSeverityLabel(level)` - Convert short form to full label
  - `'d'` → `'DEBUG'`
  - `'i'` → `'INFO'`
  - `'w'` → `'WARNING'`
  - `'e'` → `'ERROR'`

#### Event Code Formats

```javascript
// 6-digit format (padded)
recorder.emit(42, 'i', 'Event');  // → [000042]

// Legacy format (no padding)
const recorder = new Recorder({ eventCodeFormat: 'legacy' });
recorder.emit(42, 'i', 'Event');  // → [42]
```

### Utilities

Static utility functions.

#### Path Operations

- `static NormalizePath(path)` - Convert to Unix-style path, resolve `.` and `..`
- `static CanonicalPath(path)` - Get absolute canonical path
- `static PathsEqual(path1, path2)` - Platform-aware path comparison
- `static MatchPath(path, pattern)` - Match path against glob pattern
- `static async ListFiles(directory, options)` - List files in directory
  - Options: `{ recursive: boolean, pattern: string }`

#### User Detection

- `static getUserFromCertificate(dn)` - Extract user from x.509 DN
  - Supports formats: `CN=user@domain`, `/CN=user@domain`, `emailAddress=user@domain`
- `static getUserFromHeaders(headers)` - Extract user from HTTP headers
  - Checks: `remote-user`, `x-remote-user`, `remote_user`
- `static getCurrentUser()` - Get current OS user
  - Fallback chain: x.509 cert → HTTP headers → process.env.USER

#### Sensitive Data Masking

- `static maskSensitiveData(str, config)` - Mask credentials in string
  - Default fields: `password`, `pwd`, `secret`, `token`, `api_key`, `uid`, `user`
  - Custom config: `{ sensitiveFields: string[] }`
- `static getSensitiveFields(config)` - Get list of sensitive field names

### UploadObject

File upload handler with CGI and HTTP support.

#### Constructor Options

```javascript
new UploadObject({
  uploadDir: string,              // Upload directory path (required)
  maxFileSize: number,            // Max file size in bytes (default: 50MB)
  allowedTypes: string[],         // Allowed MIME types (default: all)
  keepExtensions: boolean,        // Preserve file extensions (default: true)
  multiples: boolean,             // Allow multiple files (default: true)
  recorder: Recorder,             // Recorder for logging (optional)
  filenamePrefix: string          // Prefix for uploaded files (optional)
})
```

#### Methods

- `async upload(request)` - Handle HTTP upload
  - `request` (IncomingMessage): HTTP request object
  - Returns: `Promise<Array<UploadedFile>>`

- `async uploadFromCGI()` - Handle CGI upload
  - Reads from stdin (CGI environment)
  - Returns: `Promise<Array<UploadedFile>>`

#### UploadedFile Object

```javascript
{
  filename: string,        // Original filename
  path: string,            // Full path to saved file
  size: number,            // File size in bytes
  type: string,            // MIME type
  lastModifiedDate: Date,  // Last modified date
  hash: string             // File hash (if available)
}
```

## Environment Variables

### Recorder

```bash
LOG_LEVEL=debug|info|warning|error  # Minimum log severity
LOG_FILE=./logs/app.log             # Optional log file path
RESCOR_LOG_BASE=/var/rescor/logs    # Central base directory for Recorder files
RESCOR_LOG_TEE=true|false           # Tee mode (console + file)
TC_LOG_BASE=/var/rescor/logs        # Legacy override (TestingCenter compatibility)
SPM_LOG_BASE=/var/rescor/logs       # Legacy override (SPM compatibility)
```

### Recorder Ops Note (RECORDER-OPS-CENTRAL-LOGGING)

Use Recorder file persistence as the primary historical log source across projects,
and keep minimal stdout/stderr output for process liveness and fatal startup failures.

Recommended baseline:

- Set `RESCOR_LOG_BASE` to a shared host directory (for example `/var/rescor/logs`).
- Keep Recorder as the canonical event log (`event-code`, severity, context).
- In containers, use bind mounts so Recorder files persist outside container lifecycle.
- Keep stdout/stderr for orchestrator visibility, but do not rely on it for long-term history.

Example docker-compose snippet:

```yaml
services:
  api:
    environment:
      RESCOR_LOG_BASE: /var/rescor/logs
    volumes:
      - /srv/rescor/logs:/var/rescor/logs
```

Search key for quick recall: `RECORDER-OPS-CENTRAL-LOGGING`

### User Detection

```bash
USER=username                       # OS user (fallback)
SSL_CLIENT_S_DN=/CN=user@domain     # x.509 certificate DN (Apache)
REMOTE_USER=user@domain             # HTTP authenticated user
```

## Examples

Complete examples are available in [packages/core-utils/examples/](examples/):

- [recorder-basic.mjs](examples/recorder-basic.mjs) - Basic event logging
- [recorder-file.mjs](examples/recorder-file.mjs) - Logging to file
- [utilities-paths.mjs](examples/utilities-paths.mjs) - Path operations
- [utilities-users.mjs](examples/utilities-users.mjs) - User detection
- [utilities-masking.mjs](examples/utilities-masking.mjs) - Sensitive data masking
- [upload-http.mjs](examples/upload-http.mjs) - HTTP file upload
- [upload-cgi.mjs](examples/upload-cgi.mjs) - CGI file upload

## Testing

### Unit Tests

```bash
npm test                    # Run unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

Test coverage:
- **Recorder**: 23 tests covering event emission, severity levels, file output
- **Utilities**: 47 tests covering path ops, user detection, masking
- **UploadObject**: Covered in integration tests

## Event Codes

Standard event code ranges:

- **100000-100099**: Recorder internal events
- **100010-100019**: UploadObject events (file upload errors)
- **Custom ranges**: Applications can define their own ranges

## Architecture

### Package Structure

```
packages/core-utils/
├── src/
│   ├── index.mjs          # Main exports
│   ├── Recorder.mjs       # Event logging system
│   ├── Utilities.mjs      # Path/user/masking utilities
│   └── UploadObject.mjs   # File upload handler
├── test/
│   └── unit/              # Unit tests
├── examples/              # Usage examples
└── README.md              # This file
```

### Design Principles

1. **No External Dependencies**: Pure Node.js built-ins (except formidable for uploads)
2. **Promise-Based**: All async operations return promises
3. **Type-Safe**: Full JSDoc for editor autocomplete
4. **Error Handling**: Consistent error reporting via Recorder
5. **Platform-Aware**: Cross-platform path handling (Windows/Unix)

## Dependencies

### Production

- `formidable@^3.5.0` - Form/file upload parsing

### Development

- `vitest` - Testing framework

## Migration from TestCenter/SPM

If migrating from testingcenter.rescor.net or spm.rescor.net:

1. **Replace imports**:
   ```javascript
   // Old
   import { Recorder } from './Recorder.mjs';
   import { Utilities } from './Utilities.mjs';

   // New
   import { Recorder, Utilities } from '@rescor/core-utils';
   ```

2. **Update UploadObject**:
   ```javascript
   // Old (callback-based)
   upload.processUpload(req, (err, files) => {
     if (err) return handleError(err);
     console.log(files);
   });

   // New (promise-based)
   try {
     const files = await upload.upload(req);
     console.log(files);
   } catch (err) {
     handleError(err);
   }
   ```

3. **Update Recorder**:
   - Constructor now accepts options object instead of separate parameters
   - `close()` method ensures stream is destroyed (prevents hanging)

See [MIGRATION-TC.md](../../MIGRATION-TC.md) and [MIGRATION-SPM.md](../../MIGRATION-SPM.md) for complete migration guides.

## Troubleshooting

### Recorder doesn't write to file

**Problem**: Events not appearing in log file

**Solutions**:
- Check file path is writable
- Verify directory exists
- Ensure `recorder.close()` is called (flushes buffer)
- Check log level setting (events below level are filtered)

### File uploads fail silently

**Problem**: `upload()` completes but no files saved

**Solutions**:
- Check upload directory exists and is writable
- Verify file size doesn't exceed `maxFileSize`
- Check MIME type is in `allowedTypes` (if specified)
- Review Recorder events for detailed error messages

### Path operations behave differently on Windows

**Problem**: Path comparisons fail on Windows

**Solutions**:
- Use `Utilities.PathsEqual()` for cross-platform comparison
- Use `Utilities.NormalizePath()` to convert to Unix-style
- Avoid hardcoded path separators (use `path.join()`)

## Security Considerations

### Sensitive Data Masking

The masking system is defense-in-depth:
- Prevents accidental credential logging
- Not a substitute for proper secret management
- Does NOT protect against intentional data exfiltration

### File Upload Security

UploadObject includes basic protections:
- File size limits (`maxFileSize`)
- MIME type filtering (`allowedTypes`)
- Filename sanitization (removes path traversal)

**Additional recommendations**:
- Validate file contents, not just extensions
- Store uploads outside web root
- Use virus scanning for user uploads
- Implement rate limiting

## Contributing

This package is part of the private @rescor monorepo. For development:

1. Make changes in `packages/core-utils/src/`
2. Add tests in `packages/core-utils/test/`
3. Run tests: `npm test`
4. Update examples if API changes
5. Update this README if features change

## License

UNLICENSED - Private internal use only

## Support

For issues, questions, or contributions, contact the RESCOR development team.

---

**Part of the @rescor Core Package Suite**:
- [@rescor/core-db](../core-db) - Database operations
- [@rescor/core-config](../core-config) - Configuration and secrets
- [@rescor/core-utils](../core-utils) - Shared utilities (this package)
- [@rescor/core-auth](../core-auth) - Authentication
