/**
 * Neo4jTransforms - Neo4j-specific transform extensions
 *
 * Extends the base Transforms system with Neo4j-specific types:
 * - node: Extract properties from Neo4j Node objects
 * - relationship: Extract properties from Neo4j Relationship objects
 * - path: Extract segments from Neo4j Path objects
 * - neo4j-int: Convert Neo4j Integer to JavaScript number
 * - labels: Extract node labels as array
 */

import neo4j from 'neo4j-driver';
import { Transforms, TransformColumn } from './Transforms.mjs';

/**
 * Neo4j-specific transform column
 *
 * Extends TransformColumn with Neo4j type conversions
 */
export class Neo4jTransformColumn extends TransformColumn {
  /**
   * Apply type conversion with Neo4j types
   *
   * @param {*} value - Value to convert
   * @param {string} type - Target type
   * @returns {*} - Converted value
   * @override
   */
  _applyTypeConversion(value, type) {
    // Handle Neo4j-specific types first
    switch (type.toLowerCase()) {
      case 'node':
        return this._nodeToObject(value);

      case 'relationship':
      case 'rel':
        return this._relationshipToObject(value);

      case 'path':
        return this._pathToArray(value);

      case 'neo4j-int':
      case 'neo4j-integer':
        return this._neo4jIntToNumber(value);

      case 'labels':
        return this._extractLabels(value);

      case 'properties':
        return this._extractProperties(value);

      default:
        // Fall back to base class type conversions
        return super._applyTypeConversion(value, type);
    }
  }

  /**
   * Convert Neo4j Node to plain object
   *
   * @param {Object} value - Neo4j Node
   * @returns {Object} - Plain object with properties + metadata
   * @private
   */
  _nodeToObject(value) {
    if (!value || !(value instanceof neo4j.types.Node)) {
      return value;
    }

    return {
      ...this._convertProperties(value.properties),
      _labels: value.labels,
      _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity
    };
  }

  /**
   * Convert Neo4j Relationship to plain object
   *
   * @param {Object} value - Neo4j Relationship
   * @returns {Object} - Plain object with properties + metadata
   * @private
   */
  _relationshipToObject(value) {
    if (!value || !(value instanceof neo4j.types.Relationship)) {
      return value;
    }

    return {
      ...this._convertProperties(value.properties),
      _type: value.type,
      _id: neo4j.isInt(value.identity) ? value.identity.toNumber() : value.identity,
      _startId: neo4j.isInt(value.start) ? value.start.toNumber() : value.start,
      _endId: neo4j.isInt(value.end) ? value.end.toNumber() : value.end
    };
  }

  /**
   * Convert Neo4j Path to array of segments
   *
   * @param {Object} value - Neo4j Path
   * @returns {Array} - Array of path segments
   * @private
   */
  _pathToArray(value) {
    if (!value || !(value instanceof neo4j.types.Path)) {
      return value;
    }

    return value.segments.map(segment => ({
      start: this._nodeToObject(segment.start),
      relationship: this._relationshipToObject(segment.relationship),
      end: this._nodeToObject(segment.end)
    }));
  }

  /**
   * Convert Neo4j Integer to JavaScript number
   *
   * @param {*} value - Neo4j Integer or other value
   * @returns {number|*} - JavaScript number or original value
   * @private
   */
  _neo4jIntToNumber(value) {
    if (neo4j.isInt(value)) {
      return value.toNumber();
    }
    return value;
  }

  /**
   * Extract labels from Neo4j Node
   *
   * @param {Object} value - Neo4j Node
   * @returns {Array|*} - Array of labels or original value
   * @private
   */
  _extractLabels(value) {
    if (value instanceof neo4j.types.Node) {
      return value.labels;
    }
    return value;
  }

  /**
   * Extract properties from Neo4j Node or Relationship
   *
   * @param {Object} value - Neo4j Node or Relationship
   * @returns {Object|*} - Properties object or original value
   * @private
   */
  _extractProperties(value) {
    if (value instanceof neo4j.types.Node || value instanceof neo4j.types.Relationship) {
      return this._convertProperties(value.properties);
    }
    return value;
  }

  /**
   * Convert object properties (handles nested Neo4j types)
   *
   * @param {Object} properties - Object properties
   * @returns {Object} - Converted properties
   * @private
   */
  _convertProperties(properties) {
    const converted = {};

    for (const [key, value] of Object.entries(properties)) {
      // Recursively convert Neo4j integers
      if (neo4j.isInt(value)) {
        converted[key] = value.toNumber();
      } else if (Array.isArray(value)) {
        converted[key] = value.map(item =>
          neo4j.isInt(item) ? item.toNumber() : item
        );
      } else {
        converted[key] = value;
      }
    }

    return converted;
  }
}

/**
 * Neo4j-specific transforms collection
 *
 * Extends base Transforms with Neo4j type support
 *
 * @example
 * import { Neo4jTransforms } from '@rescor-llc/core-db';
 *
 * const transforms = new Neo4jTransforms()
 *   .add('host', { type: 'node' })                // Extract node properties
 *   .add('affects', { type: 'relationship' })     // Extract relationship
 *   .add('path_to_source', { type: 'path' })      // Extract path segments
 *   .add('node_id', { type: 'neo4j-int' })        // Convert Integer to number
 *   .add('host_labels', { type: 'labels', from: 'host' });
 */
export class Neo4jTransforms extends Transforms {
  /**
   * Add a Neo4j-specific transform
   *
   * @param {string} columnName - Column name
   * @param {Object} options - Transform options
   * @returns {Neo4jTransforms} - This instance for chaining
   * @override
   */
  add(columnName, options = {}) {
    const column = new Neo4jTransformColumn(columnName, options);
    this.columns.set(column.columnName, column);
    return this;
  }
}

/**
 * Common Neo4j transform patterns
 *
 * Pre-configured transforms for common Neo4j scenarios
 */
export class CommonNeo4jTransforms {
  /**
   * Create transforms for extracting node properties
   *
   * @param {string[]} nodeColumns - Column names containing nodes
   * @returns {Neo4jTransforms} - Configured transforms
   *
   * @example
   * const transforms = CommonNeo4jTransforms.forNodes(['host', 'finding']);
   */
  static forNodes(nodeColumns) {
    const transforms = new Neo4jTransforms();
    nodeColumns.forEach(col => {
      transforms.add(col, { type: 'node' });
    });
    return transforms;
  }

  /**
   * Create transforms for extracting relationship properties
   *
   * @param {string[]} relColumns - Column names containing relationships
   * @returns {Neo4jTransforms} - Configured transforms
   */
  static forRelationships(relColumns) {
    const transforms = new Neo4jTransforms();
    relColumns.forEach(col => {
      transforms.add(col, { type: 'relationship' });
    });
    return transforms;
  }

  /**
   * Create transforms for extracting path segments
   *
   * @param {string[]} pathColumns - Column names containing paths
   * @returns {Neo4jTransforms} - Configured transforms
   */
  static forPaths(pathColumns) {
    const transforms = new Neo4jTransforms();
    pathColumns.forEach(col => {
      transforms.add(col, { type: 'path' });
    });
    return transforms;
  }

  /**
   * Create transforms for converting Neo4j integers
   *
   * @param {string[]} intColumns - Column names containing Neo4j Integers
   * @returns {Neo4jTransforms} - Configured transforms
   */
  static forIntegers(intColumns) {
    const transforms = new Neo4jTransforms();
    intColumns.forEach(col => {
      transforms.add(col, { type: 'neo4j-int' });
    });
    return transforms;
  }

  /**
   * Create transforms for complete finding result
   *
   * Handles Test -> Horizon -> Host -> Finding -> Source object chain
   *
   * @returns {Neo4jTransforms} - Configured transforms
   */
  static forFindingChain() {
    return new Neo4jTransforms()
      .add('t', { type: 'node', newName: 'test' })
      .add('hz', { type: 'node', newName: 'horizon' })
      .add('h', { type: 'node', newName: 'host' })
      .add('f', { type: 'node', newName: 'finding' })
      .add('s', { type: 'node', newName: 'source' });
  }

  /**
   * Create transforms for ticket thread result
   *
   * Handles Ticket -> Message -> Attachment chain
   *
   * @returns {Neo4jTransforms} - Configured transforms
   */
  static forTicketThread() {
    return new Neo4jTransforms()
      .add('t', { type: 'node', newName: 'ticket' })
      .add('m', { type: 'node', newName: 'message' })
      .add('a', { type: 'node', newName: 'attachment' })
      .add('sent_by', { type: 'relationship' });
  }
}
