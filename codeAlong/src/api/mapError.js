// Error mapping for supabase errors

export class AppError extends Error {
  constructor(code, message, { status = 500, cause } = {}) {
    super(message) // so error.message is the friendly text
    this.name = 'AppError'
    this.code = code // e.g. 'CONFLICT', for code that needs to react differently
    this.status = status
    this.cause = cause // the original Supabase error, kept for debugging
  }
}

const STATUS = {
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  INTERNAL: 500,
}

// Supabase Auth errors (from supabase.auth.*)
const AUTH = {
  invalid_credentials: ['UNAUTHENTICATED', 'Invalid email or password'],
  user_already_exists: ['CONFLICT', 'An account with that email already exists'],
  email_exists: ['CONFLICT', 'An account with that email already exists'],
  weak_password: ['VALIDATION_FAILED', 'Password is too weak — use at least 8 characters'],
  email_address_invalid: ['VALIDATION_FAILED', 'Enter a valid email address'],
  validation_failed: ['VALIDATION_FAILED', 'Enter a valid email address'], // badly formatted email on sign-up
  anonymous_provider_disabled: ['VALIDATION_FAILED', 'Enter your email and password'], // sign-up with an empty email
  email_not_confirmed: ['UNAUTHENTICATED', 'Check your email to confirm your account first'],
  user_banned: ['FORBIDDEN', 'This account has been disabled — contact your instructor'],
  over_request_rate_limit: ['RATE_LIMITED', 'Too many attempts — wait a minute and try again'],
}

// Postgres / PostgREST errors (from supabase.from / .rpc)
const DB = {
  23505: ['CONFLICT', 'That already exists'], // unique violation
  23503: ['NOT_FOUND', 'That no longer exists'], // foreign key violation
  23514: ['VALIDATION_FAILED', 'Some of that information is not valid'], // check constraint
  42501: ['FORBIDDEN', "You don't have permission to do that"], // RLS said no
  '22P02': ['NOT_FOUND', 'Not found'], // malformed id in a URL
  PGRST116: ['NOT_FOUND', 'Not found'], // .single() found no row
}

export function mapError(error) {
  if (!error) return null
  if (error instanceof AppError) return error

  // 1. Your own RPCs: raise exception 'CODE|message' using errcode = 'P0001'
  if (error.code === 'P0001' && error.message?.includes('|')) {
    const [code, ...rest] = error.message.split('|')
    return new AppError(code, rest.join('|'), { status: STATUS[code] ?? 400, cause: error })
  }

  // 2. Known Supabase Auth and Postgres codes
  const known = AUTH[error.code] ?? DB[error.code]
  if (known) {
    const [code, message] = known
    return new AppError(code, message, { status: STATUS[code], cause: error })
  }

  // 3. Couldn't reach Supabase at all
  if (/failed to fetch/i.test(error.message ?? '')) {
    return new AppError('UPSTREAM_UNAVAILABLE', "Can't reach the server — check your connection", {
      status: 502,
      cause: error,
    })
  }

  // 4. Anything else: never show raw database text to a user
  console.error('Unmapped error:', error)
  return new AppError('INTERNAL', 'Something went wrong', { cause: error })
}
