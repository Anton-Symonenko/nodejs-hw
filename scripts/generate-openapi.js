import fs from 'node:fs/promises';
import * as authValidation from '../src/validations/authValidation.js';
import * as notesValidation from '../src/validations/notesValidation.js';
import { TAGS } from '../src/constants/tags.js';
import { Note } from '../src/models/note.js';
import { User } from '../src/models/user.js';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

// Convert the actual Joi descriptions, rather than maintaining duplicate request schemas.
function convert(description, field) {
  const { type, flags = {}, rules = [], allow = [], keys, items, matches } = description;
  if (!['string', 'number', 'boolean', 'object', 'array', 'alternatives'].includes(type)) {
    throw new Error(`Unsupported Joi type: ${type}`);
  }
  const schema = type === 'alternatives'
    ? { oneOf: matches.map((match) => convert(match.schema)) }
    : { type: type === 'number' && rules.some((rule) => rule.name === 'integer') ? 'integer' : type };
  if (type === 'string' && !allow.includes('')) schema.minLength = 1;
  if (flags.only) schema.enum = allow.filter((value) => value !== null);
  if (allow.includes(null)) schema.nullable = true;
  if (flags.default !== undefined) schema.default = flags.default;
  if (type === 'object') {
    schema.properties = Object.fromEntries(Object.entries(keys || {}).map(([name, value]) => [name, convert(value, name)]));
    schema.additionalProperties = flags.unknown === true;
    const required = Object.entries(keys || {}).filter(([, value]) => value.flags?.presence === 'required').map(([name]) => name);
    if (required.length) schema.required = required;
  }
  if (type === 'array') {
    const converted = (items || []).map((item) => convert(item));
    schema.items = converted.length === 1 ? converted[0] : { oneOf: converted };
  }
  for (const rule of rules) {
    const limit = rule.args?.limit;
    if (['min', 'max', 'length'].includes(rule.name)) {
      const pair = { string: ['minLength', 'maxLength'], object: ['minProperties', 'maxProperties'], array: ['minItems', 'maxItems'], number: ['minimum', 'maximum'] }[type];
      if (rule.name !== 'max') schema[pair[0]] = limit;
      if (rule.name !== 'min') schema[pair[1]] = limit;
    } else if (rule.name === 'email') schema.format = 'email';
    else if (rule.name === 'integer') continue;
    else if (rule.name === 'pattern') schema.pattern = rule.args.regex.source;
    else if (rule.name === 'custom' && field === 'noteId') {
      schema.pattern = '^[a-fA-F0-9]{24}$';
      schema.description = 'MongoDB ObjectId validated by mongoose.isValidObjectId. The Joi field itself is optional; OpenAPI path parameters are always required.';
    } else throw new Error(`Unsupported Joi rule: ${rule.name} on ${field || type}`);
  }
  return schema;
}

const schemas = {};
const validationNames = new Map();
for (const [name, segments] of Object.entries({ ...authValidation, ...notesValidation })) {
  const names = {};
  for (const [segment, joi] of Object.entries(segments)) {
    const schemaName = name[0].toUpperCase() + name.slice(1).replace(/Schema$/, '') + segment[0].toUpperCase() + segment.slice(1);
    schemas[schemaName] = convert(joi.describe());
    names[segment] = schemaName;
  }
  validationNames.set(name, names);
}
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const timestamps = { createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } };
schemas.User = {
  type: 'object', additionalProperties: false,
  required: ['_id', 'email', 'username', 'avatar', 'createdAt', 'updatedAt', '__v'],
  properties: { _id: objectId, email: { type: 'string' }, username: { type: 'string', description: 'Defaults to the email on save.' }, avatar: { type: 'string', default: 'https://ac.goit.global/fullstack/react/default-avatar.jpg' }, ...timestamps, __v: { type: 'integer' } },
  description: 'Serialized User document. The toJSON method removes password.'
};
schemas.Note = {
  type: 'object', additionalProperties: false,
  required: ['_id', 'title', 'content', 'tag', 'userId', 'createdAt', 'updatedAt', '__v'],
  properties: { _id: objectId, title: { type: 'string', description: 'Trimmed by Mongoose.' }, content: { type: 'string', default: '', description: 'Trimmed by Mongoose.' }, tag: { type: 'string', enum: TAGS, default: 'Todo' }, userId: objectId, ...timestamps, __v: { type: 'integer' } }
};
schemas.NotePage = { type: 'object', additionalProperties: false, required: ['page', 'perPage', 'totalNotes', 'totalPages', 'notes'], properties: { page: schemas.GetAllNotesQuery.properties.page, perPage: schemas.GetAllNotesQuery.properties.perPage, totalNotes: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 }, notes: { type: 'array', items: ref('Note') } } };
schemas.Message = { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string' } } };
schemas.ValidationError = { type: 'object', additionalProperties: false, required: ['statusCode', 'error', 'message', 'validation'], properties: {
  statusCode: { type: 'integer', enum: [400] }, error: { type: 'string', enum: ['Bad Request'] }, message: { type: 'string' }, validation: { type: 'object', additionalProperties: { type: 'object', additionalProperties: false, required: ['source', 'keys', 'message'], properties: { source: { type: 'string', enum: ['body', 'query', 'params', 'headers', 'cookies', 'signedCookies'] }, keys: { type: 'array', items: { type: 'string' } }, message: { type: 'string' } } } }
} };
schemas.AvatarUpload = { type: 'object', required: ['avatar'], properties: { avatar: { type: 'string', format: 'binary', description: 'One file with an image/* MIME type, up to 2097152 bytes (2 MiB).', 'x-maxBytes': 2097152, 'x-allowedMimeTypes': ['image/*'] } }, description: 'Multer accepts other text fields and ignores them. No Celebrate validation is applied.' };
schemas.AvatarResponse = { type: 'object', additionalProperties: false, required: ['url'], properties: { url: { type: 'string', description: 'Cloudinary secure_url saved as the user avatar.' } } };

// Show field settings as readable code in Swagger's expanded schema descriptions.
const displayTypes = { string: 'String', integer: 'Number', number: 'Number', boolean: 'Boolean', array: 'Array', object: 'Object' };
function fieldDefinition(name, field, required, model) {
  const settings = [`    type: ${displayTypes[field.type] || 'Object'},`, `    required: ${required},`];
  if (model?.schema.path(name)?.options.trim === true) settings.push('    trim: true,');
  for (const key of ['format', 'default', 'enum', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'minItems', 'maxItems', 'nullable']) {
    if (field[key] !== undefined) settings.push(`    ${key}: ${JSON.stringify(field[key])},`);
  }
  return `  ${name}: {\n${settings.join('\n')}\n  },`;
}
for (const [name, schema] of Object.entries(schemas)) {
  if (!schema.properties) continue;
  const model = name === 'Note' ? Note : name === 'User' ? User : undefined;
  const code = Object.entries(schema.properties).map(([fieldName, field]) => fieldDefinition(fieldName, field, schema.required?.includes(fieldName) || false, model)).join('\n');
  const definition = `Field definitions:\n\n\`\`\`javascript\n{\n${code}\n}\n\`\`\``;
  schema.description = [schema.description, definition].filter(Boolean).join('\n\n');
}
const json = (schema) => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const error = (description) => response(description, ref('Message'));
const access = [{ sessionId: [], accessToken: [] }];
const refresh = [{ sessionId: [], refreshToken: [] }];
const sessionHeaders = { 'Set-Cookie': { description: 'Three separate Set-Cookie headers set sessionId (1 day), accessToken (15 minutes), and refreshToken (1 day). All use HttpOnly; Secure; SameSite=None; Path=/.', schema: { type: 'string' } } };
const authDescription = 'Requires sessionId and accessToken cookies. Session must exist, access token must be unexpired, and the user must exist. Notes are scoped to that user.';
const paths = {};
function add(method, path, { id, tag, summary, description, validation, security = [], success = '200', result, successDescription, errors = {}, cookies = false }) {
  const operation = { operationId: id, tags: [tag], summary, description, security, responses: {
    [success]: response(successDescription || summary, result ? ref(result) : undefined),
    '400': error('Malformed JSON or invalid JSON body rejected by the global express.json parser.'),
    '413': error('JSON body exceeds the global express.json default limit (100 KiB).'),
    '415': error('Unsupported JSON request charset or content encoding.'),
    '500': error('Unexpected errors, including database/cast failures, return the error message.')
  } };
  if (cookies) operation.responses[success].headers = sessionHeaders;
  if (security.length) operation.responses['401'] = error('Missing session credentials; Session not found; Access token expired; User not found.');
  if (validation) {
    const names = validationNames.get(validation);
    for (const segment of ['params', 'query', 'headers']) {
      if (!names[segment]) continue;
      operation.parameters ||= [];
      for (const name of Object.keys(schemas[names[segment]].properties)) {
        operation.parameters.push({ name, in: segment === 'params' ? 'path' : segment === 'headers' ? 'header' : 'query', required: segment === 'params' || (schemas[names[segment]].required || []).includes(name), schema: { $ref: `#/components/schemas/${names[segment]}/properties/${name}` } });
      }
    }
    if (names.body) operation.requestBody = { required: true, description: 'JSON body validated by Celebrate/Joi; unknown keys are rejected.', content: json(ref(names.body)) };
    operation.responses['400'] = response('Celebrate request validation failed, or the global JSON parser rejected the body.', { oneOf: [ref('ValidationError'), ref('Message')] });
  }
  for (const [status, description] of Object.entries(errors)) {
    operation.responses[status] = status === '400' && validation
      ? response(description + ' Or Celebrate request validation failed / JSON parsing failed.', { oneOf: [ref('Message'), ref('ValidationError')] })
      : error(description + (status === '400' ? ' Malformed JSON also returns 400.' : ''));
  }
  paths[path] ||= {};
  paths[path][method] = operation;
  return operation;
}
add('post', '/auth/register', { id: 'registerUser', tag: 'Auth', summary: 'Register a user', description: 'Creates a user, hashes the password, creates a session and sets three session cookies.', validation: 'registerUserSchema', success: '201', result: 'User', cookies: true, errors: { '400': 'Email in use.' } });
add('post', '/auth/login', { id: 'loginUser', tag: 'Auth', summary: 'Log in', description: 'Checks email and password, deletes one existing session for the user, creates a session and sets three session cookies.', validation: 'loginUserSchema', result: 'User', cookies: true, errors: { '401': 'Invalid credentials.' } });
add('post', '/auth/refresh', { id: 'refreshUserSession', tag: 'Auth', summary: 'Refresh the session', description: 'Deletes the old session and creates a new one with new cookies. An expired refresh session is deleted and its cookies cleared. No Celebrate validation.', security: refresh, result: 'Message', cookies: true, errors: { '401': 'Missing session credentials; Session not found; Session token expired.' } });
paths['/auth/refresh'].post.responses['200'].content['application/json'].example = { message: 'Session refreshed' };
const logout = add('post', '/auth/logout', { id: 'logoutUser', tag: 'Auth', summary: 'Log out', description: 'Deletes a session if sessionId is supplied and clears all three cookies. No authentication or Celebrate validation; missing cookies still yield 204.', success: '204' });
logout.parameters = [{ name: 'sessionId', in: 'cookie', required: false, schema: { type: 'string' }, description: 'Session ID to delete, if supplied. Malformed IDs can produce a database cast error (500).' }];
logout.responses['204'].headers = { 'Set-Cookie': { description: 'Separate headers expire sessionId, accessToken and refreshToken.', schema: { type: 'string' } } };
add('post', '/auth/request-reset-email', { id: 'requestResetEmail', tag: 'Auth', summary: 'Request a password reset email', description: 'Returns the same message whether the email exists or not. Existing users receive a link with a JWT valid for 15 minutes.', validation: 'requestResetEmailSchema', result: 'Message', errors: { '500': 'Failed to send the email, please try again later. Template, signing and other unexpected errors also return 500.' } });
paths['/auth/request-reset-email'].post.responses['200'].content['application/json'].example = { message: 'Password reset email sent successfully' };
add('post', '/auth/reset-password', { id: 'resetPassword', tag: 'Auth', summary: 'Reset the password', description: 'Verifies the reset JWT, updates the password and deletes all sessions for the user.', validation: 'resetPasswordSchema', result: 'Message', errors: { '401': 'Invalid or expired token.', '404': 'User not found.' } });
paths['/auth/reset-password'].post.responses['200'].content['application/json'].example = { message: 'Password reset successfully' };
add('get', '/notes', { id: 'getAllNotes', tag: 'Notes', summary: 'List your notes', description: authDescription + ' Supports pagination, tag filtering and case-insensitive regular expression search in title or content. Unknown query keys are rejected.', validation: 'getAllNotesSchema', security: access, result: 'NotePage' });
add('post', '/notes', { id: 'createNote', tag: 'Notes', summary: 'Create a note', description: authDescription + ' Mongoose defaults missing content to an empty string and tag to Todo.', validation: 'createNoteSchema', security: access, success: '201', result: 'Note' });
for (const [method, id, summary, validation] of [['get', 'getNoteById', 'Get a note', 'noteIdSchema'], ['patch', 'updateNote', 'Update a note', 'updateNoteSchema'], ['delete', 'deleteNote', 'Delete a note', 'noteIdSchema']]) {
  add(method, '/notes/{noteId}', { id, tag: 'Notes', summary, description: authDescription + (method === 'delete' ? ' Returns the deleted document.' : method === 'patch' ? ' Requires at least one body property; returns the updated document.' : ''), validation, security: access, result: 'Note', errors: { '404': 'Note not found (including notes belonging to another user).' } });
}
const avatar = add('patch', '/users/me/avatar', { id: 'updateUserAvatar', tag: 'Users', summary: 'Update your avatar', description: 'Requires sessionId and accessToken cookies. Uploads the image to Cloudinary, resizes it to 500 × 500, stores the URL and returns it. Authentication runs in the preceding unscoped notes router and again on this route. No Celebrate validation.', security: access, result: 'AvatarResponse', errors: { '400': 'No file.', '500': 'Multer errors (Only images allowed, File too large, Unexpected field), Cloudinary failures and other unexpected errors return {message} with status 500.' } });
avatar.requestBody = { required: true, content: { 'multipart/form-data': { schema: ref('AvatarUpload') } } };
const spec = {
  openapi: '3.0.0', info: { title: pkg.name, version: pkg.version, description: pkg.description || 'Express notes API with cookie-based sessions, user avatars and email password resets. Generated request schemas come directly from the Celebrate/Joi schemas. Unknown routes return 404 {message: "Route not found"} after preceding middleware; unauthenticated requests reaching the unscoped notes router instead return 401.' },
  servers: [{ url: 'http://localhost:3000', description: 'Local server (default PORT=3000). Change this URL if PORT is overridden.' }],
  tags: [{ name: 'Auth', description: 'Registration, sessions and password resets.' }, { name: 'Notes', description: 'Notes belonging to the authenticated user.' }, { name: 'Users', description: 'User avatar uploads.' }],
  paths, components: { securitySchemes: {
    sessionId: { type: 'apiKey', in: 'cookie', name: 'sessionId', description: 'HttpOnly session identifier set by register, login and refresh.' },
    accessToken: { type: 'apiKey', in: 'cookie', name: 'accessToken', description: 'HttpOnly opaque UUID access token, valid for 15 minutes. Required together with sessionId.' },
    refreshToken: { type: 'apiKey', in: 'cookie', name: 'refreshToken', description: 'HttpOnly opaque UUID refresh token, valid for one day. Required together with sessionId for refresh.' }
  }, schemas }
};
await fs.writeFile(new URL('../swagger.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log(`Generated swagger.json: ${Object.values(paths).reduce((sum, operations) => sum + Object.keys(operations).length, 0)} operations.`);
