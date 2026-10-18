import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'fs';
import { KINDS, auditCity, formatReport } from '../src/game/logic/audit';

describe('city geometry audit', () => {
  const report = auditCity({ rawProps: !!process.env.AUDIT_RAW });
  if (process.env.AUDIT_OUT) {
    writeFileSync(
      process.env.AUDIT_OUT,
      formatReport(report) +
        '\n\n' +
        report.findings
          .slice(0, 4000)
          .map((f) => `${f.kind}\t${f.district}\t${Math.round(f.x)},${Math.round(f.z)}\t${f.what}`)
          .join('\n')
    );
  }
  it('audits the whole planned world', () => {
    expect(report.audited.lots).toBeGreaterThan(1000);
    expect(report.audited.props).toBeGreaterThan(1000);
    expect(report.audited.edges).toBeGreaterThan(1000);
  });
  for (const k of KINDS)
    it(`finds no ${k} overlaps`, () => {
      const bad = report.findings.filter((f) => f.kind === k);
      expect(bad.slice(0, 8).map((f) => `${f.district} ${Math.round(f.x)},${Math.round(f.z)} ${f.what}`)).toEqual([]);
      expect(report.counts[k]).toBe(0);
    });
});
