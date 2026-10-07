import { describe, expect, it } from 'vitest';

import {
  sanitizeTopicSampleSize,
  segmentEstimateSql,
  smallestFindableTopic,
} from '../topicSampling';

describe('topic sampling', () => {
  it('reads a typed sample size, and treats blank as the suggestion', () => {
    expect(sanitizeTopicSampleSize('50,000')).toBe(50_000);
    expect(sanitizeTopicSampleSize(' 12345.6 ')).toBe(12_346);
    expect(sanitizeTopicSampleSize('20')).toBe(1_000);
    expect(sanitizeTopicSampleSize('')).toBeNull();
    expect(sanitizeTopicSampleSize('lots')).toBeNull();
  });

  it('names the smallest topic a sample can still find', () => {
    expect(smallestFindableTopic(10, 107_551, 20_000)).toBe(54);
    expect(smallestFindableTopic(10, 100_000, 100_000)).toBe(10);
  });

  it('estimates Automatic segments from text length over the token window', () => {
    const sql = segmentEstimateSql('node-1', 'text', 'automatic', 256);
    expect(sql).toContain('GREATEST(1, CEIL(LENGTH(');
    expect(sql).toContain('/ 1024.0');
    expect(sql).toContain('FROM "node-1"');
  });

  it('estimates Paragraph segments from non-empty lines', () => {
    const sql = segmentEstimateSql('node-1', 'my "text"', 'line', 256);
    expect(sql).toContain('"my ""text"""');
    expect(sql).toContain("'\n'");
    expect(sql).toContain("'\n\n'");
  });
});
