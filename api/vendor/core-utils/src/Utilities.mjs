/**
 * Utilities - Common helper functions
 *
 * Consolidated from testingcenter.rescor.net/src/backend/modules/Utilities.mjs
 *
 * Collection of lightweight, reusable helper routines:
 * - Path handling and normalization
 * - User detection (x.509 certificates, environment)
 * - Sensitive data masking
 * - File listing
 * - Stack trace utilities
 *
 * @example
 * import { Utilities } from '@rescor-llc/core-utils';
 *
 * const user = Utilities.currentUser();
 * const masked = Utilities.maskSensitiveData('password=secret123');
 * const files = await Utilities.ListFiles('/path/to/dir', ['.xml', '.json']);
 */

import { basename } from 'path';
import * as fp from 'path';
import * as fs from 'fs/promises';
import os from 'os';

export class Utilities {
  /**
   * Default file extensions for ListFiles
   */
  static DEFAULT_EXTENSIONS = ['.xml', '.nessus', '.json'];

  /**
   * Default sensitive field patterns for masking
   */
  static DEFAULT_SENSITIVE_FIELDS = [
    'password', 'pwd', 'secret', 'token', 'apikey', 'api_key', 'api-key',
    'authorization', 'auth', 'bearer'
  ];

  /**
   * Normalize file input into consistent descriptor
   *
   * @param {string} directory - Base directory to join against
   * @param {string} file - Filename or path
   * @returns {Object} Normalized path descriptor { file, base, path }
   *
   * @example
   * Utilities.NormalizePath('/var/data', 'file.xml')
   * // { file: 'file.xml', base: 'file.xml', path: '/var/data/file.xml' }
   */
  static NormalizePath(directory, file) {
    let answer = null;

    try {
      const base = basename(file);
      const path = fp.join(directory, base);
      answer = { file: file, base: base, path: path };
    } catch (error) {
      // Fallback: best-effort normalization
      const base = basename(String(file));
      const path = fp.join(directory, base);
      answer = { file: file, base: base, path: path };
    }

    return answer;
  }

  /**
   * Get caller function name from V8 stack trace
   *
   * @param {number} [depth=0] - Frames to skip beyond immediate caller
   * @returns {string|null} Caller function name
   *
   * @example
   * function myFunction() {
   *   console.log(Utilities.Caller()); // 'myFunction'
   * }
   */
  static Caller(depth = 0) {
    let answer = null;

    // Create Error and parse stack frames
    const frames = new Error().stack?.split(/\n\s*/).slice(1) || [];

    // Filter out Utilities.Caller frames
    const cleaned = frames.filter(frame => !/Utilities\.Caller|\.Caller/.test(frame));
    const target = cleaned[depth] || frames[depth] || null;

    try {
      answer = target?.match(/^at\s+(.*?)\s/)?.[1] || null;
    } catch (error) {
      answer = null;
    }

    return answer;
  }

  /**
   * Resolve path to canonical absolute form
   *
   * @param {string} path - Path to resolve
   * @returns {string} Canonical absolute path
   *
   * @example
   * Utilities.CanonicalPath('./foo/../bar')
   * // '/absolute/path/to/bar'
   */
  static CanonicalPath(path) {
    let answer = path;

    try {
      answer = fp.resolve(path);
    } catch (error) {
      answer = path;
    }

    return answer;
  }

  /**
   * Compare two paths for equivalence
   *
   * Uses multiple comparison strategies:
   * 1. Canonical absolute paths
   * 2. Basenames (helps when DB stores only basenames)
   * 3. Decoded URIs (handles URL encoding)
   *
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {boolean} True if paths are equivalent
   *
   * @example
   * Utilities.PathsEqual('/foo/bar.xml', './foo/bar.xml') // true
   * Utilities.PathsEqual('bar.xml', '/some/path/bar.xml') // true (basename match)
   */
  static PathsEqual(path1, path2) {
    let answer = false;

    if (!path1 || !path2) {
      answer = false;
    } else {
      // Strategy 1: Canonical absolute paths
      try {
        const canonical1 = Utilities.CanonicalPath(path1);
        const canonical2 = Utilities.CanonicalPath(path2);
        if (canonical1 === canonical2) answer = true;
      } catch (error) {
        // Continue to next strategy
      }

      // Strategy 2: Basename comparison
      if (!answer) {
        try {
          if (basename(path1) === basename(path2)) answer = true;
        } catch (error) {
          // Continue to next strategy
        }
      }

      // Strategy 3: Decoded URI comparison
      if (!answer) {
        try {
          if (decodeURI(path1) === decodeURI(path2)) answer = true;
        } catch (e) {
          // No more strategies
        }
      }
    }

    return answer;
  }

  /**
   * Determine if element path matches filesystem file path
   *
   * Performs fast equality checks and falls back to robust comparisons
   *
   * @param {Object} element - Object with .path property
   * @param {string} file - Original file path
   * @param {string} normalized - Normalized path
   * @returns {boolean} True if element matches file
   *
   * @example
   * const element = { path: '/data/file.xml' };
   * Utilities.MatchPath(element, 'file.xml', '/data/file.xml') // true
   */
  static MatchPath(element, file, normalized) {
    let answer = false;

    if (!element || !element.path) {
      answer = false;
    } else {
      const base = basename(file);

      // Fast equality checks
      if (element.path === file || element.path === normalized || element.path === base) {
        answer = true;
      } else {
        // Robust fallbacks
        if (Utilities.PathsEqual(element.path, normalized)) answer = true;
        if (!answer && Utilities.PathsEqual(element.path, file)) answer = true;
      }
    }

    return answer;
  }

  /**
   * List files in directory filtered by extensions
   *
   * @param {string} directory - Directory to read
   * @param {string[]} [extensions] - Extensions to include (e.g., ['.xml', '.json'])
   * @returns {Promise<string[]>} Filenames matching extensions
   * @throws {Error} If directory cannot be read
   *
   * @example
   * const files = await Utilities.ListFiles('/data', ['.xml', '.json']);
   * // ['file1.xml', 'file2.json']
   */
  static async ListFiles(directory, extensions = Utilities.DEFAULT_EXTENSIONS) {
    let answers = [];

    try {
      const files = await fs.readdir(directory || '.');
      answers = files.filter((file) => extensions.includes(fp.extname(file)));
    } catch (error) {
      answers = [];
      throw error;
    }

    return answers;
  }

  /**
   * Get current user from x.509 certificate or environment
   *
   * Detection order:
   * 1. Parameter containing x.509 DN
   * 2. SSL_CLIENT_S_DN environment variable (Apache SSL)
   * 3. CLIENT_CERT_SUBJECT_UID environment variable (deprecated - legacy servers)
   * 4. REMOTE_USER environment variable
   * 5. System process owner
   *
   * @param {string} [candidate] - Optional x.509 DN to parse
   * @returns {string} Current user identifier
   *
   * @example
   * const user = Utilities.currentUser();
   * // Returns username from SSL cert or system user
   *
   * const user = Utilities.currentUser('/emailAddress=user@example.com/CN=...');
   * // Returns 'user'
   */
  static currentUser(candidate = null) {
    let currentUser;

    if (candidate) {
      // Parse email from x.509 DN: /emailAddress=username@domain
      const emailMatch = candidate.match(/\/emailAddress=([^@]+)@/);
      currentUser = emailMatch ? emailMatch[1] : candidate;
    } else if (process.env.SSL_CLIENT_S_DN) {
      // Apache SSL: extract email from subject DN
      const emailMatch = process.env.SSL_CLIENT_S_DN.match(/\/emailAddress=([^@]+)@/);
      currentUser = emailMatch ? emailMatch[1] : process.env.SSL_CLIENT_S_DN;
    } else if (process.env.CLIENT_CERT_SUBJECT_UID) {
      // Deprecated: CLIENT_CERT_SUBJECT_UID (late-1990s/early-2000s servers)
      // Extract username (part before underscore)
      const uidMatch = process.env.CLIENT_CERT_SUBJECT_UID.match(/^([^_]+)/);
      currentUser = uidMatch ? uidMatch[1] : process.env.CLIENT_CERT_SUBJECT_UID;
    } else if (process.env.REMOTE_USER) {
      // Extract username (part before underscore)
      const userMatch = process.env.REMOTE_USER.match(/^([^_]+)/);
      currentUser = userMatch ? userMatch[1] : process.env.REMOTE_USER;
    } else {
      // Fall back to system process owner
      try {
        currentUser = os.userInfo().username;
      } catch (error) {
        currentUser = 'SYSTEM';
      }
    }

    return currentUser;
  }

  /**
   * Get configured sensitive field patterns using fallback strategy
   *
   * Fallback order (highest to lowest priority):
   * 1. Configuration parameter sensitiveFields array
   * 2. Keychain/store metadata 'sensitive_fields' (via Configuration)
   * 3. RESCOR_SENSITIVE_FIELDS environment variable (comma-separated)
   * 4. TC_SENSITIVE_FIELDS environment variable (backward compatibility)
   * 5. DEFAULT_SENSITIVE_FIELDS
   *
   * @param {Object} [config={}] - Configuration object
   * @param {string[]} [config.sensitiveFields] - Array of field names to mask
   * @param {Object} [config.metadata] - Metadata from Configuration
   * @returns {string[]} Array of sensitive field names
   *
   * @example
   * const fields = Utilities.getSensitiveFields({ sensitiveFields: ['api_key', 'token'] });
   * // ['api_key', 'token']
   */
  static getSensitiveFields(config = {}) {
    // 1. Configuration parameter (highest priority)
    if (config.sensitiveFields && Array.isArray(config.sensitiveFields)) {
      return config.sensitiveFields;
    }

    // 2. Configuration metadata (preferred over environment variables)
    if (config.metadata && config.metadata.sensitive_fields) {
      const metadataFields = config.metadata.sensitive_fields;
      if (Array.isArray(metadataFields)) {
        return metadataFields;
      } else if (typeof metadataFields === 'string') {
        return metadataFields
          .split(',')
          .map(field => field.trim().toLowerCase())
          .filter(field => field.length > 0);
      }
    }

    // Backward compatibility: check keychainMetadata
    if (config.keychainMetadata && config.keychainMetadata.sensitive_fields) {
      const keychainFields = config.keychainMetadata.sensitive_fields;
      if (Array.isArray(keychainFields)) {
        return keychainFields;
      } else if (typeof keychainFields === 'string') {
        return keychainFields
          .split(',')
          .map(field => field.trim().toLowerCase())
          .filter(field => field.length > 0);
      }
    }

    // 3. Environment variable (RESCOR first, then TC for backward compatibility)
    const envVar = process.env.RESCOR_SENSITIVE_FIELDS ||
                   process.env.TC_SENSITIVE_FIELDS;

    if (envVar) {
      return envVar
        .split(',')
        .map(field => field.trim().toLowerCase())
        .filter(field => field.length > 0);
    }

    // 4. Default fields (lowest priority)
    return Utilities.DEFAULT_SENSITIVE_FIELDS;
  }

  /**
   * Mask sensitive data in strings
   *
   * Replaces patterns like `password=secret` with `password=***MASKED***`
   *
   * @param {string} str - String potentially containing sensitive data
   * @param {Object} [config={}] - Configuration object
   * @param {string[]} [config.sensitiveFields] - Array of field names to mask
   * @returns {string} String with sensitive patterns masked
   *
   * @example
   * const masked = Utilities.maskSensitiveData('password=secret123&token=abc');
   * // 'password=***MASKED***&token=***MASKED***'
   */
  static maskSensitiveData(str, config = {}) {
    if (typeof str !== 'string') return str;

    const sensitiveFields = Utilities.getSensitiveFields(config);
    let masked = str;

    // Build regex pattern for each sensitive field
    // Use global flag to replace ALL occurrences
    for (const field of sensitiveFields) {
      // Escape special regex characters in field name
      const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Match patterns: field=value, field:value, field = value, field: value
      // Global flag ensures all occurrences are replaced
      const pattern = new RegExp(`${escapedField}\\s*[=:]\\s*[^\\s,;&)]+`, 'gi');
      masked = masked.replace(pattern, `${field}=***MASKED***`);
    }

    return masked;
  }

  /**
   * Mask sensitive data in objects (recursive)
   *
   * @param {Object} obj - Object potentially containing sensitive data
   * @param {Object} [config={}] - Configuration object
   * @returns {Object} Object with sensitive fields masked
   *
   * @example
   * const masked = Utilities.maskSensitiveObject({ password: 'secret', name: 'user' });
   * // { password: '***MASKED***', name: 'user' }
   */
  static maskSensitiveObject(obj, config = {}) {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveFields = Utilities.getSensitiveFields(config);
    const masked = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if key matches sensitive field
      if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively mask nested objects
        masked[key] = Utilities.maskSensitiveObject(value, config);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }
}
