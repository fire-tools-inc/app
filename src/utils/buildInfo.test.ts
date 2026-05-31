import { describe, expect, it } from 'vitest';
import { buildCommitUrl, formatCommit } from './buildInfo';

describe('formatCommit', () => {
  it('truncates long hashes to 7 chars', () => {
    expect(formatCommit('abcdef0123456789')).toBe('abcdef0');
  });

  it('returns hash unchanged when shorter than 7 chars', () => {
    expect(formatCommit('abc')).toBe('abc');
  });

  it('returns "unknown" placeholder for empty / unknown input', () => {
    expect(formatCommit('')).toBe('unknown');
    expect(formatCommit('unknown')).toBe('unknown');
  });
});

describe('buildCommitUrl', () => {
  const sha = 'abcdef0123456789';

  it('returns null when repoUrl is missing', () => {
    expect(buildCommitUrl('', sha)).toBeNull();
  });

  it('returns null when commit is missing or unknown', () => {
    expect(buildCommitUrl('https://github.com/o/r', '')).toBeNull();
    expect(buildCommitUrl('https://github.com/o/r', 'unknown')).toBeNull();
  });

  it('builds GitHub commit URL', () => {
    expect(buildCommitUrl('https://github.com/o/r', sha)).toBe(
      `https://github.com/o/r/commit/${sha}`,
    );
  });

  it('builds GitLab commit URL (same shape as GitHub)', () => {
    expect(buildCommitUrl('https://gitlab.com/o/r', sha)).toBe(
      `https://gitlab.com/o/r/commit/${sha}`,
    );
  });

  it('builds Bitbucket commit URL (uses /commits/)', () => {
    expect(buildCommitUrl('https://bitbucket.org/o/r', sha)).toBe(
      `https://bitbucket.org/o/r/commits/${sha}`,
    );
  });

  it('strips trailing slashes on repoUrl', () => {
    expect(buildCommitUrl('https://github.com/o/r/', sha)).toBe(
      `https://github.com/o/r/commit/${sha}`,
    );
  });
});
