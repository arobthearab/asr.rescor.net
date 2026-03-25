/**
 * UploadObject - File upload handling
 *
 * Consolidated from testingcenter.rescor.net/src/backend/modules/UploadObject.mjs
 *
 * Provides file upload handling via formidable with support for:
 * - CGI environments (Apache, nginx)
 * - Modern HTTP servers (Express, Fastify, etc.)
 * - File validation and filtering
 * - Automatic directory creation
 * - Event logging via Recorder
 *
 * @example
 * import { UploadHandler, MockRequest } from '@rescor-llc/core-utils';
 *
 * // CGI environment
 * const mockReq = new MockRequest().request;
 * const handler = new UploadHandler('/var/www/uploads');
 * await handler.upload(mockReq);
 *
 * // Modern HTTP server
 * const handler = new UploadHandler('/uploads', /\.(xml|json)$/i);
 * await handler.upload(req);
 */

import { Recorder } from './Recorder.mjs';
import { IncomingForm } from 'formidable';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* -------------------------------------------------------------------------- */
/**
 * Mock HTTP request object for formidable parsing in CGI context
 *
 * Wraps process.stdin and CGI environment variables into formidable-compatible
 * request interface. Used when running as CGI script (Apache, nginx, etc.)
 *
 * @example
 * // In CGI environment
 * const mockReq = new MockRequest().request;
 * form.parse(mockReq, callback);
 */
export class MockRequest {
  /* -------------------------------------------------------------------------- */
  /**
   * Create mock request from CGI environment
   *
   * Reads headers from CGI environment variables:
   * - REQUEST_METHOD → method
   * - CONTENT_TYPE → headers['content-type']
   * - CONTENT_LENGTH → headers['content-length']
   *
   * Pipes stdin as request body
   */
  constructor() {
    this.request = {
      method: process.env.REQUEST_METHOD || 'POST',
      headers: {
        'content-type': process.env.CONTENT_TYPE || 'multipart/form-data',
        'content-length': process.env.CONTENT_LENGTH || '0'
      },
      pipe: (destination) => process.stdin.pipe(destination),
      on: (event, callback) => process.stdin.on(event, callback),
      unpipe: (destination) => process.stdin.unpipe(destination),
      resume: () => process.stdin.resume(),
      pause: () => process.stdin.pause()
    };
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Handles file uploads via CGI or HTTP with formidable
 *
 * Features:
 * - Automatic target directory creation
 * - File validation via regex patterns
 * - Filename transformation (sanitization, renaming)
 * - Event logging via Recorder
 * - Promise-based API
 *
 * Event Codes:
 * - 100010 - Upload parsing error
 * - 100020 - File rename/move error
 * - 100030 - File successfully saved
 * - 100040 - File validation failed
 * - 100050 - Target directory creation failed
 */
export class UploadHandler {
  /* -------------------------------------------------------------------------- */
  /**
   * Default upload directory from environment or fallback
   */
  static DEFAULT_TARGET_PATH = process.env.RESCOR_UPLOAD_PATH ||
                                process.env.TC_UPLOAD_PATH ||
                                process.env.SPM_UPLOAD_PATH ||
                                '/var/www/uploads';

  /* -------------------------------------------------------------------------- */
  /**
   * Default file pattern for validation (xml, nessus, json)
   */
  static DEFAULT_FILE_PATTERN = /\.(?:xml|nessus|json)$/i;

  /* -------------------------------------------------------------------------- */
  /**
   * Generate HTTP Content-Type header for HTML response
   * @returns {string} Content-Type header string
   */
  static ContentHeader() {
    return 'Content-Type: text/html\n';
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Create upload handler
   *
   * @param {string} [targetPath] - Upload directory (env: RESCOR_UPLOAD_PATH, TC_UPLOAD_PATH, SPM_UPLOAD_PATH)
   * @param {RegExp} [filePattern] - File validation pattern
   * @param {Recorder} [recorder] - Logger instance
   * @param {Function} [renamer] - Filename transformation function
   *
   * @example
   * const handler = new UploadHandler('/uploads', /\.(xml|json)$/i);
   *
   * @example
   * const handler = new UploadHandler('/uploads', /\.xml$/i, recorder, (name) => {
   *   return name.toLowerCase().replace(/[^a-z0-9.-]/g, '_');
   * });
   */
  constructor(
    targetPath = UploadHandler.DEFAULT_TARGET_PATH,
    filePattern = UploadHandler.DEFAULT_FILE_PATTERN,
    recorder = new Recorder(),
    renamer = (name) => name
  ) {
    this.recorder = recorder;
    this.filePattern = filePattern;
    this.renamer = renamer;
    this.form = new IncomingForm({
      keepExtensions: true,
      multiples: true,
      maxFileSize: 100 * 1024 * 1024 // 100MB default
    });

    this.setTargetPath(targetPath);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Set and create upload target directory
   *
   * @param {string} targetPath - Directory path to create
   * @returns {string} Resolved target path
   * @throws {Error} If directory creation fails
   *
   * @example
   * handler.setTargetPath('/var/uploads/xml');
   */
  setTargetPath(targetPath) {
    this.targetPath = path.resolve(targetPath);
    this.form.uploadDir = this.targetPath;

    try {
      fs.mkdirSync(this.targetPath, { recursive: true });
    } catch (error) {
      const message = `failed to create ${this.targetPath}: ${error.message}`;
      this.recorder.emit(100050, 'e', message);
      throw new Error(message);
    }

    return this.targetPath;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Get current upload target path
   *
   * @param {string} [original] - Original path (unused, for interface compatibility)
   * @returns {string} Current target path
   */
  getTargetPath(original = null) {
    void original;
    return this.targetPath;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Validate filename against pattern
   *
   * @param {string} filename - Filename to validate
   * @returns {boolean} True if filename matches pattern
   *
   * @example
   * handler.validateFile('data.xml') // true
   * handler.validateFile('script.js') // false
   */
  validateFile(filename) {
    return this.filePattern.test(filename);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Parse incoming upload and save files to target directory
   *
   * @param {Object} request - HTTP request object (real or mock)
   * @returns {Promise<Object[]>} Array of saved file info { path, name, size }
   * @throws {Error} If parsing fails or file operations fail
   *
   * @example
   * // CGI environment
   * const mockReq = new MockRequest().request;
   * const files = await handler.upload(mockReq);
   *
   * @example
   * // Express
   * app.post('/upload', async (req, res) => {
   *   const files = await handler.upload(req);
   *   res.json({ files });
   * });
   */
  async upload(request) {
    return new Promise((resolve, reject) => {
      this.form.parse(request, async (error, fields, files) => {
        if (error) {
          const message = `file upload error: ${error.message}`;
          this.recorder.emit(100010, 'e', message);
          return reject(new Error(message));
        }

        try {
          // Normalize files to array
          const fileList = this._normalizeFiles(files);
          const savedFiles = [];

          for (const file of fileList) {
            const savedFile = await this._saveFile(file);
            if (savedFile) {
              savedFiles.push(savedFile);
            }
          }

          resolve(savedFiles);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Normalize formidable files object to array
   * @private
   * @param {Object} files - Formidable files object
   * @returns {Array} Normalized file array
   */
  _normalizeFiles(files) {
    // Handle different formidable versions and field names
    let fileList = [];

    for (const fieldName of Object.keys(files)) {
      const fieldFiles = files[fieldName];

      if (Array.isArray(fieldFiles)) {
        fileList = fileList.concat(fieldFiles);
      } else if (fieldFiles) {
        fileList.push(fieldFiles);
      }
    }

    return fileList;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Save uploaded file to target directory
   * @private
   * @param {Object} file - Formidable file object
   * @returns {Promise<Object|null>} Saved file info or null if validation fails
   */
  async _saveFile(file) {
    const originalName = file.originalFilename || file.name;

    // Validate filename
    if (!this.validateFile(originalName)) {
      const message = `file rejected: ${originalName} (pattern: ${this.filePattern})`;
      this.recorder.emit(100040, 'w', message);
      return null;
    }

    // Apply renamer transformation
    const transformedName = this.renamer(originalName);
    const oldPath = file.filepath || file.path;
    const newPath = path.join(this.targetPath, transformedName);

    try {
      await fsPromises.rename(oldPath, newPath);

      const fileInfo = {
        path: newPath,
        name: transformedName,
        size: file.size
      };

      this.recorder.emit(100030, 'i', `file saved: ${transformedName} (${file.size} bytes)`);
      return fileInfo;
    } catch (error) {
      const message = `rename from ${oldPath} to ${newPath} failed: ${error.message}`;
      this.recorder.emit(100020, 'e', message);
      throw new Error(message);
    }
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Run the CGI upload flow
 *
 * Isolated side-effect function for CGI execution. Prints HTTP headers
 * and HTML output directly to stdout.
 *
 * Environment variables:
 * - RESCOR_UPLOAD_PATH, TC_UPLOAD_PATH, SPM_UPLOAD_PATH - Upload directory
 * - CONTENT_TYPE - Request content type
 * - CONTENT_LENGTH - Request content length
 * - REQUEST_METHOD - HTTP method
 *
 * @example
 * // In CGI script
 * import { performUpload } from '@rescor-llc/core-utils';
 * performUpload();
 */
export async function performUpload() {
  // CGI headers must be printed first
  console.log(UploadHandler.ContentHeader());

  try {
    // Mimic a standard Node.js request object for formidable
    const mockRequest = new MockRequest().request;

    // Determine upload directory from environment
    const uploadDir = process.env.RESCOR_UPLOAD_PATH ||
                      process.env.TC_UPLOAD_PATH ||
                      process.env.SPM_UPLOAD_PATH ||
                      path.join(process.cwd(), 'uploads');

    const handler = new UploadHandler(uploadDir);
    const files = await handler.upload(mockRequest);

    // Success response
    if (files.length > 0) {
      console.log('<h1>Success!</h1>');
      console.log('<ul>');
      for (const file of files) {
        console.log(`<li>File saved: ${file.name} (${file.size} bytes)</li>`);
      }
      console.log('</ul>');
    } else {
      console.log('<h1>No files uploaded</h1>');
    }
  } catch (error) {
    console.log(`<h1>Error: ${error.message}</h1>`);
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Auto-execute in CGI environment
 *
 * Detects CGI execution context and calls performUpload() automatically.
 * Only runs when:
 * 1. Module is executed directly (not imported)
 * 2. CGI environment detected (GATEWAY_INTERFACE or REQUEST_METHOD)
 */
const __filename = fileURLToPath(import.meta.url);
const directExecution =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;
const cgiEnvironment =
  Boolean(process.env.GATEWAY_INTERFACE || process.env.REQUEST_METHOD);

if (directExecution && cgiEnvironment) {
  performUpload().catch((error) => {
    console.log(UploadHandler.ContentHeader());
    console.log(`<h1>Fatal Error: ${error.message}</h1>`);
  });
}
