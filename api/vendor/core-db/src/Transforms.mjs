/**
 * Transforms - Composable row transformation system
 *
 * Provides sophisticated row normalization with:
 * - Column name transformations (case normalization, renaming)
 * - Value transformations (custom functions, type conversions)
 * - Type conversions (int, float, bool, json, date, string, uppercase, lowercase, trim)
 * - Default value handling for null/undefined columns
 * - Source column aliasing via the `from` option
 */

/* -------------------------------------------------------------------------- */

/**
 * Error thrown when a transform operation fails.
 * Extends the built-in `Error` class for easy identification in catch blocks.
 */
export class TransformError extends Error {}

/* -------------------------------------------------------------------------- */

/**
 * Describes a single transform rule, consisting of recognized aliases,
 * an action to apply to the value, and an optional fallback value.
 *
 * Instances are stored in {@link TransformTypes} and can be passed directly
 * to {@link TransformColumn} as the second constructor argument.
 */
export class TransformDetails {
  /* ------------------------------------------------------------------------ */

  /**
   * @param {string[]} aliases - Lowercase alias strings that identify this transform
   * @param {Function|*} action - Function applied to the value, or a literal replacement value
   * @param {*} [fallback=null] - Value to use when the transform throws or produces null
   */
  constructor (aliases, action, fallback = null) {
    this.aliases = aliases;
    this.action = action;
    this.fallback = fallback;
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Return a plain object copy of this instance.
   *
   * @returns {Object} Shallow copy of this `TransformDetails`
   */
  toObject() {
    return Object.assign({}, this);
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Apply this transform's action to the given value.
   *
   * If `action` is not a function it is returned as-is (literal replacement).
   * If `action` throws, the error is re-thrown wrapped in a {@link TransformError}.
   *
   * @param {*} value - The value to transform
   * @returns {*} The transformed result
   * @throws {TransformError} When the action function throws
   */
  transform (value) {
    if (!(this.action instanceof Function)) {
      return this.action;
    }

    try {
      return this.action(value);
    } catch (error) {
      throw new TransformError(`error applying transform: ${error.message}`);
    }
  }
}

/* -------------------------------------------------------------------------- */

/**
 * Frozen registry of built-in type transforms. Each entry is a
 * {@link TransformDetails} instance keyed by canonical name.
 *
 * Entries can be referenced directly and passed to {@link TransformColumn}:
 * ```js
 * new TransformColumn('score',      TransformTypes.Float)
 * new TransformColumn('created_at', TransformTypes.Date)
 * new TransformColumn('label',      TransformTypes.Uppercase)
 * ```
 *
 * `find()` and `lookup()` support resolution by canonical key or alias string
 * (e.g. `'int'`, `'bool'`, `'datetime'`), so the string-shorthand API is
 * preserved for callers that prefer it:
 * ```js
 * new TransformColumn('id', { type: 'int' })
 * ```
 */
export const TransformTypes = Object.freeze({
  Integer: new TransformDetails(['int', 'integer'], value => parseInt(value)),
  Float: new TransformDetails(['float', 'number'], value => parseFloat(value)),
  Boolean: new TransformDetails(['bool', 'boolean'], value => {
    if (value === 0 || value === false || value === '' || value === null) return false;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') return false;
    }
    return Boolean(value);
  }),
  JSON:new TransformDetails(['json'], value => JSON.parse(value)),
  Date:new TransformDetails(['date'], value => new Date(value)),
  Time:new TransformDetails(['time'], value => new Date(value)),
  Timestamp: new TransformDetails(['timestamp', 'datetime'], value => new Date(value)),
  String:new TransformDetails(['string'], value => String(value)),
  Uppercase: new TransformDetails(['uppercase', 'upper'], value => typeof value === 'string' ? value.toUpperCase() : value),
  Lowercase: new TransformDetails(['lowercase', 'lower'], value => typeof value === 'string' ? value.toLowerCase() : value),
  Trim:new TransformDetails(['trim'], value => typeof value === 'string' ? value.trim() : value),

  /* ------------------------------------------------------------------------ */

  /**
   * Resolve a {@link TransformDetails} rule by canonical key or alias without
   * applying it.
   *
   * Resolution order:
   * 1. `candidate` is already a `TransformDetails` instance — returned as-is.
   * 2. `candidate` matches a canonical key (e.g. `'Integer'`, `'Float'`).
   * 3. Case-insensitive alias search across all registered entries.
   *
   * @param {string|TransformDetails} candidate - Canonical key, alias, or rule instance
   * @returns {TransformDetails|null} Matching rule, or `null` if not found
   */
  find (candidate) {
    if (candidate instanceof TransformDetails) return candidate;
    if (this[candidate] instanceof TransformDetails) return this[candidate];

    const lower = String(candidate).toLowerCase();

    return Object.values(this).find(
      value => value instanceof TransformDetails && value.aliases?.includes(lower)
    ) ?? null;
  },

  /* ------------------------------------------------------------------------ */

  /**
   * Resolve and apply a transform rule to the given value.
   *
   * Delegates resolution to {@link TransformTypes.find}, then calls
   * {@link TransformDetails#transform} on the result. Returns `null` when no
   * rule matches.
   *
   * @param {string|TransformDetails} candidate - Canonical key, alias, or rule instance
   * @param {*} value - Value to transform
   * @param {Object} [options={}] - Transformation options
   * @param {boolean} [options.raise=false] - Re-throw conversion errors instead of silencing them
   * @param {boolean} [options.log=false] - Log a warning to the console when conversion fails
   * @param {*} [options.fallback=null] - Value to return when conversion fails
   * @returns {*} Transformed value, fallback, or `null` when no rule matches
   */
  lookup (candidate, value, { raise = false, log = false, fallback = null } = {}) {
    const rule = this.find(candidate);

    if (!rule) return null;

    try {
      return rule.transform(value);
    } catch (error) {
      if (raise) throw error;
      if (log) console.warn(`error in ${candidate} conversion: ${error.message}`);
      return fallback ?? rule.fallback;
    }
  }
});

/* -------------------------------------------------------------------------- */
/**
 * Represents a transformation rule for a single database column.
 *
 * Supports:
 * - Column name normalisation or renaming (`newName`, `nameTransform`)
 * - Value transformation via a custom function (`valueTransform` / `transform`)
 * - Built-in type conversion via `options.type` (string alias or `TransformTypes.*` reference)
 * - Source column aliasing (`from`), so the value is read from a different column
 * - Default values for `null` or `undefined` source values (`defaultValue` / `default`)
 *
 * @example
 * // String alias
 * new TransformColumn('score', { type: 'float' })
 *
 * // TransformDetails reference (preferred — avoids string lookup)
 * new TransformColumn('score', TransformTypes.Float)
 *
 * // Custom transform
 * new TransformColumn('label', { valueTransform: value => value?.trim().toLowerCase() })
 */
export class TransformColumn {
  /* ------------------------------------------------------------------------ */
  /**
   * @param {string} columnName             - Column name to match 
   *                                          against row keys (case-insensitive)
   * @param {Object|TransformDetails} [options={}] - Transform options, or a 
   *                                         `TransformDetails`
   *   instance as a shorthand for `{ type: details }`.
   * @param {Function} [options.nameTransform] - `(name) => string` to transform 
   *                                          the output key
   * @param {Function} [options.valueTransform] - `(value, row) => *` to 
   *                                          transform the column value
   * @param {Function} [options.transform]  - Alias for `valueTransform`
   * @param {string} [options.newName]      - Rename the output key to this 
   *                                          exact string
   * @param {string} [options.from]         - Read the value from this source 
   *                                          column instead of `columnName`
   * @param {*} [options.defaultValue]      - Default value when the source 
   *                                          is `null` or `undefined`
   * @param {*} [options.default]           - Alias for `defaultValue`
   * @param {string|TransformDetails} [options.type] - Type conversion: string 
   *                                          alias (e.g. `'int'`)
   *                                          or a `TransformTypes.*` reference
   *               (e.g. `TransformTypes.Integer`)
   */
  constructor (columnName, options={}) {
    // TransformDetails shorthand
    if (options instanceof TransformDetails) {
      options = { type: options };
    }

    this.columnName = columnName.toLowerCase();
    this.suppliedName = columnName; // Keep original casing for compatibility
    this.options = options; // Store original options for inspection
    this.nameTransform = options.nameTransform || null;
    this.valueTransform = options.valueTransform || options.transform || null;
    this.newName = options.newName || null; // Rename TO this name
    this.fromColumn = options.from || null; // Get value FROM this source column
    this.defaultValue = 'default' in options ? options.default :
                        'defaultValue' in options ? options.defaultValue :
                        undefined;
    this.type = options.type || null;
  }
  /* ------------------------------------------------------------------------ */
  /**
   * Compute the output key name for this column.
   *
   * Priority:
   * 1. `options.newName` if set — returned verbatim.
   * 2. `options.nameTransform(name)` if set — result of the custom function.
   * 3. `name.toLowerCase()` — default normalisation.
   *
   * @param {string} name - The original column name from the row
   * @returns {string} The output key name to use in the transformed row
   */
  transformName (name) {
    if (this.newName) return this.newName;
    if (this.nameTransform) return this.nameTransform(name);
    return name.toLowerCase();
  }
  /* ------------------------------------------------------------------------ */
  /**
   * Compute the output value for this column.
   *
   * Processing order:
   * 1. Return `defaultValue` for `undefined` inputs (when a default is set).
   * 2. Return `defaultValue` for `null` inputs (when a default is explicitly set).
   * 3. Apply built-in type conversion via `options.type` if configured.
   * 4. Apply `valueTransform(value, row)` if configured.
   *
   * @param {*} value - The raw value read from the source row
   * @param {Object} [row={}] - The full source row, passed to `valueTransform` for context
   * @returns {*} The transformed value
   */
  transformValue (value, row = {}) {
    // Handle undefined with default (but not null — null is a valid DB value)
    if (value === undefined) {
      return this.defaultValue !== undefined ? this.defaultValue : undefined;
    }

    // Handle null: return default if set, otherwise preserve null without type conversion
    if (value === null) {
      return this.defaultValue !== undefined ? this.defaultValue : null;
    }

    let transformed = value;

    if (this.type) {
      transformed = this._applyTypeConversion(value, this.type);
    }

    if (this.valueTransform) {
      transformed = this.valueTransform(transformed, row);
    }

    return transformed;
  }

  /* ------------------------------------------------------------------------ */
  /**
   * Resolve and apply a built-in type conversion using {@link TransformTypes.find}.
   *
   * If the type is not recognised, or if the conversion throws, a warning is
   * logged and the original value is returned unchanged.
   *
   * @param {*} value - Value to convert
   * @param {string|TransformDetails} type - Type key, alias, or `TransformDetails` instance
   * @returns {*} Converted value, or the original value if unrecognised or conversion fails
   * @private
   */
  _applyTypeConversion (value, type) {
    const rule = TransformTypes.find(type);

    if (!rule) {
      console.warn(`there is no type transform for ${type}, returning original value`);
      return value;
    }

    try {
      return rule.transform(value);
    } catch (error) {
      console.warn(`type transform '${type}' failed for value ${JSON.stringify(value)}: ${error.message}`);
      return value;
    }
  }

  /* ------------------------------------------------------------------------ */
  /**
   * Resolve the source column value from a row and return the transformed result.
   *
   * Source key resolution order (to accommodate DB2-style all-uppercase rows):
   * 1. `options.from` if set, otherwise `columnName`.
   * 2. Uppercase version of the source name.
   * 3. Exact source name as provided.
   * 4. `undefined` if neither key is present in the row.
   *
   * @param {string} columnName - The column name being processed (used as fallback source key)
   * @param {Object} row - The full source row object
   * @returns {*} The transformed value
   *
   * @example
   * const col = new TransformColumn('count', TransformTypes.Integer);
   * col.apply('count', { COUNT: '42' }); // → 42
   */
  apply (columnName, row) {
    const sourceName = this.fromColumn || columnName;
    const upperKey = sourceName.toUpperCase();
    let value;

    if (row[upperKey] !== undefined) {
      value = row[upperKey];
    } else if (row[sourceName] !== undefined) {
      value = row[sourceName];
    } else {
      value = undefined;
    }

    return this.transformValue(value, row);
  }
}

/* -------------------------------------------------------------------------- */

/**
 * A named collection of {@link TransformColumn} rules applied to database rows.
 *
 * Columns are stored in a `Map` keyed by lowercased column name, so lookups are
 * always case-insensitive. When `applyRow` is called:
 *
 * 1. Each registered transform is applied to its source column.
 * 2. Any remaining un-transformed columns are copied with default normalisation
 *    (key lowercased, string values trimmed) so no data is silently dropped.
 *
 * @example
 * const transforms = new Transforms([
 *   new TransformColumn('test_id',   TransformTypes.Integer),
 *   new TransformColumn('created_at', TransformTypes.Date),
 *   new TransformColumn('metadata',  TransformTypes.JSON),
 * ]);
 *
 * const normalized = transforms.apply(databaseRow);
 */
export class Transforms {
  /* ------------------------------------------------------------------------ */

  /**
   * @param {TransformColumn[]} [columns=[]] - Initial array of column transformation rules
   */
  constructor (columns = []) {
    this.columns = new Map();
    for (const column of columns) {
      this.add(column);
    }
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Register a column transformation rule.
   *
   * Accepts either a pre-constructed {@link TransformColumn} instance or a
   * `(name, options)` shorthand for inline configuration.
   *
   * @param {TransformColumn|string} column - Column transformation instance or column name string
   * @param {Object|TransformDetails} [options={}] - Transform options (only used when `column` is a string)
   * @returns {Transforms} This instance, for chaining
   *
   * @example
   * transforms.add(new TransformColumn('id', TransformTypes.Integer));
   * transforms.add('id', TransformTypes.Integer);  // shorthand
   * transforms.add('id', { type: 'int' });          // string-alias shorthand
   */
  add (column, options = {}) {
    const transformColumn = typeof column === 'string'
      ? new TransformColumn(column, options)
      : column;

    this.columns.set(transformColumn.columnName, transformColumn);
    return this;
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Retrieve the {@link TransformColumn} registered for the given column name.
   *
   * @param {string} columnName - Column name to look up (case-insensitive)
   * @returns {TransformColumn|null} The registered transform, or `null` if not found
   */
  get (columnName) {
    return this.columns.get(columnName.toLowerCase()) || null;
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Check whether a transformation is registered for the given column name.
   *
   * @param {string} columnName - Column name to check (case-insensitive)
   * @returns {boolean} `true` if a transform is registered for this column
   */
  has (columnName) {
    return this.columns.has(columnName.toLowerCase());
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Apply all registered column transforms to a single database row, then
   * copy any remaining un-transformed columns with default normalisation
   * (lowercase key, string values trimmed).
   *
   * @param {Object} row - Raw database row object
   * @returns {Object} New object containing all transformed and pass-through columns
   */
  applyRow (row) {
    if (!row || typeof row !== 'object') return row;

    const transformed = {};
    const processedKeys = new Set();

    // First pass: apply registered transforms
    for (const [columnName, columnTransform] of this.columns.entries()) {
      const sourceName = columnTransform.fromColumn || columnName;
      const upperSource = sourceName.toUpperCase();
      let sourceValue;
      let sourceKey;

      if (row[upperSource] !== undefined) {
        sourceValue = row[upperSource];
        sourceKey = upperSource;
      } else if (row[sourceName] !== undefined) {
        sourceValue = row[sourceName];
        sourceKey = sourceName;
      } else {
        sourceValue = undefined;
        sourceKey = null;
      }

      // newName takes priority; fall back to suppliedName (preserves original casing)
      const outputKey = columnTransform.newName || columnTransform.suppliedName;

      transformed[outputKey] = columnTransform.transformValue(sourceValue, row);

      if (sourceKey) processedKeys.add(sourceKey.toLowerCase());
    }

    // Second pass: copy un-transformed columns (lowercase key, trim strings)
    for (const [originalKey, value] of Object.entries(row)) {
      const lowerKey = originalKey.toLowerCase();

      if (!processedKeys.has(lowerKey) && !Object.prototype.hasOwnProperty.call(transformed, lowerKey)) {
        transformed[lowerKey] = typeof value === 'string' ? value.trim() : value;
      }
    }

    return transformed;
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Apply all registered column transforms to an array of database rows.
   *
   * If a non-array value is passed it is treated as a single row and delegated
   * to {@link Transforms#applyRow}.
   *
   * @param {Object[]} rows - Array of raw database rows
   * @returns {Object[]} Array of transformed rows
   */
  applyRows (rows) {
    if (!Array.isArray(rows)) return this.applyRow(rows);
    return rows.map(row => this.applyRow(row));
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Alias for {@link Transforms#applyRows}. Provides a consistent `apply()`
   * entry-point matching the `Operations.MassageResults` pattern used elsewhere
   * in the codebase.
   *
   * @param {Object[]|Object} results - Database results (array or single row)
   * @returns {Object[]|Object} Transformed results in the same shape as the input
   */
  apply (results) {
    return this.applyRows(results);
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Number of column transform rules currently registered.
   *
   * @type {number}
   */
  get size () {
    return this.columns.size;
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Return a list of all registered column names (lowercased keys).
   *
   * @returns {string[]} Array of registered column name keys
   */
  getColumnNames () {
    return Array.from(this.columns.keys());
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Construct a `Transforms` instance from a plain configuration object.
   *
   * Each key becomes a column name and its value is passed as the options
   * argument to {@link TransformColumn}.
   *
   * @param {Object<string, Object|TransformDetails>} config - Map of column name → options
   * @returns {Transforms} New `Transforms` instance populated from the config
   *
   * @example
   * const transforms = Transforms.fromObject({
   *   test_id:  TransformTypes.Integer,
   *   metadata: TransformTypes.JSON,
   *   status:   { newName: 'test_status' }
   * });
   */
  static fromObject (config) {
    const columns = [];
    for (const [columnName, options] of Object.entries(config)) {
      columns.push(new TransformColumn(columnName, options));
    }
    return new Transforms(columns);
  }

  /* ------------------------------------------------------------------------ */

  /**
   * Construct a `Transforms` instance from a map of column names to transform
   * functions. Each function is used as the `valueTransform` for its column.
   *
   * @param {Object<string, Function>} functions - Map of column name → `(value, row) => *`
   * @returns {Transforms} New `Transforms` instance populated from the function map
   *
   * @example
   * const transforms = Transforms.fromFunctions({
   *   test_id: value => parseInt(value),
   *   status:  value => value?.toUpperCase()
   * });
   */
  static fromFunctions (functions) {
    const columns = [];
    for (const [columnName, fn] of Object.entries(functions)) {
      columns.push(new TransformColumn(columnName, { valueTransform: fn }));
    }
    return new Transforms(columns);
  }
}
