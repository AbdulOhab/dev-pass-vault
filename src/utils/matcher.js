/**
 * URL matching strategies:
 *  domain   — hostname(:port) must match, any path
 *  exact    — full URL must match (ignores hash)
 *  prefix   — URL must start with pattern
 *  contains — URL must contain pattern string
 *  wildcard — glob pattern: * matches anything except /,  ** matches everything
 */

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.href.replace(/#.*$/, '').replace(/\/$/, '');
  } catch {
    return url.replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function getDomainKey(url) {
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return url;
  }
}

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLE§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLE§/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesRule(currentUrl, rule) {
  const { pattern, type } = rule;
  const normalized = normalizeUrl(currentUrl);

  switch (type) {
    case 'domain': {
      const current = getDomainKey(currentUrl);
      const patternDomain = getDomainKey(
        pattern.startsWith('http') ? pattern : `http://${pattern}`
      );
      return current.toLowerCase() === patternDomain.toLowerCase();
    }

    case 'exact':
      return normalizeUrl(pattern).toLowerCase() === normalized.toLowerCase();

    case 'prefix':
      return normalized.toLowerCase().startsWith(pattern.toLowerCase());

    case 'contains':
      return normalized.toLowerCase().includes(pattern.toLowerCase());

    case 'wildcard': {
      const rx = wildcardToRegex(pattern);
      return rx.test(normalized);
    }

    default:
      return false;
  }
}

export function getMatchingCredentials(credentials, currentUrl) {
  return credentials.filter(cred =>
    cred.urlRules && cred.urlRules.some(rule => matchesRule(currentUrl, rule))
  );
}

export const MATCH_TYPES = [
  { value: 'domain',   label: 'Domain',   hint: 'e.g. localhost:3000 or example.com' },
  { value: 'exact',    label: 'Exact URL', hint: 'e.g. http://localhost:3000/login' },
  { value: 'prefix',   label: 'URL Prefix',hint: 'e.g. https://staging.example.com' },
  { value: 'contains', label: 'Contains',  hint: 'e.g. internal.company' },
  { value: 'wildcard', label: 'Wildcard',  hint: 'e.g. *.example.com/admin/**' },
];
