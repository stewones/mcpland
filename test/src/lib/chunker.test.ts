import { describe, expect, it } from 'vitest';

import { chunkText } from '../../../src/lib/chunker';

describe('chunkText behavior', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    // undefined or null are not allowed by type, but verify falsy guard
    expect(chunkText(undefined)).toEqual([]);
  });

  it('normalizes CRLF and preserves content', () => {
    const input = 'a\r\nb\rc\nd';
    const chunks = chunkText(input, { maxChars: 10, overlap: 0 });

    expect(chunks.join('\n')).toBe('a\nb\nc\nd');
  });

  it('splits respecting maxChars with overlap across chunk boundaries', () => {
    const lines = Array.from({ length: 20 }, (_, i) => String(i).padStart(2, '0')).join('\n');
    const chunks = chunkText(lines, { maxChars: 30, overlap: 5 });

    // Each chunk should be <= maxChars
    expect(chunks.every((c) => c.length <= 30)).toBe(true);

    // Overlap ensures the last 5 chars of previous chunk appear at start of next chunk
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const over = prev.slice(Math.max(0, prev.length - 5));
      expect(chunks[i].startsWith(over)).toBe(true);
    }
  });

  it('hard-splits a single long line without overlap', () => {
    const long = 'x'.repeat(2500);
    const chunks = chunkText(long, { maxChars: 700, overlap: 200 });
    
    // Should split into ceil(2500/700) = 4 chunks
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toBe('x'.repeat(700));
    expect(chunks[3]).toBe('x'.repeat(400));
  });

  it('pushes current chunk before handling long line', () => {
    // Test lines 20-22: pushing current before handling long line
    const input = 'short line\n' + 'x'.repeat(1500);
    const chunks = chunkText(input, { maxChars: 1000, overlap: 100 });
    
    // Should have separate chunk for short line, then split long line
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toBe('short line');
  });

  it('handles zero overlap case', () => {
    // Test lines 36-37: else branch when overlap is 0
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const chunks = chunkText(lines, { maxChars: 30, overlap: 0 });
    
    // Each chunk should start fresh without overlap
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const current = chunks[i];
      // Current chunk should NOT start with end of previous chunk
      expect(current.includes(prev.slice(-10))).toBe(false);
    }
  });

  it('handles empty pushed content case', () => {
    // Test when pushed.length is 0
    const input = '\n' + 'x'.repeat(1500);
    const chunks = chunkText(input, { maxChars: 1000, overlap: 100 });
    
    // Should handle the empty first line gracefully
    expect(chunks.length).toBeGreaterThan(0);
  });
});
