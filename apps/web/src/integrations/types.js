/**
 * Flowline Integration System - Type Definitions & Schema Contracts
 * 
 * Defines the standard metadata structure for Integration Providers, Actions, Triggers, and Fields.
 */

/**
 * @typedef {'text' | 'textarea' | 'number' | 'boolean' | 'select'} FieldType
 */

/**
 * @typedef {Object} FieldOption
 * @property {string} label
 * @property {string | number} value
 */

/**
 * @typedef {Object} FieldDefinition
 * @property {string} key - Unique field key within the action/trigger config (e.g. 'to', 'subject')
 * @property {string} label - Human readable label displayed in UI (e.g. 'To', 'Subject')
 * @property {FieldType} type - Input field control type
 * @property {boolean} required - Whether the user must provide a value before saving
 * @property {string} [placeholder] - Optional placeholder text or template example
 * @property {string} [description] - Optional field helper text
 * @property {FieldOption[]} [options] - Select options (only applicable if type === 'select')
 * @property {any} [defaultValue] - Default value for the field
 */

/**
 * @typedef {Object} ActionDefinition
 * @property {string} id - Unique action ID (e.g. 'send_email')
 * @property {string} name - Human readable action name (e.g. 'Send Email')
 * @property {string} description - Brief summary of what this action does
 * @property {FieldDefinition[]} fields - Array of configurable input fields for this action
 */

/**
 * @typedef {Object} TriggerDefinition
 * @property {string} id - Unique trigger ID (e.g. 'new_email')
 * @property {string} name - Human readable trigger name (e.g. 'New Email')
 * @property {string} description - Brief summary of what triggers this workflow
 * @property {FieldDefinition[]} fields - Array of configurable input fields for this trigger
 */

/**
 * @typedef {Object} IntegrationProvider
 * @property {string} id - Unique provider ID (e.g. 'gmail', 'slack')
 * @property {string} name - Display name (e.g. 'Gmail')
 * @property {string} description - Provider summary
 * @property {string} [icon] - Provider icon identifier or SVG asset reference
 * @property {ActionDefinition[]} actions - List of actions supported by this provider
 * @property {TriggerDefinition[]} triggers - List of triggers supported by this provider
 */

export {};
