import { describe, expect, it } from 'vitest'
import { validateBeadsIssueId } from './beads-work-item-args'

describe('validateBeadsIssueId', () => {
  it('accepts well-formed bd issue ids', () => {
    expect(validateBeadsIssueId('orca-42')).toBe('orca-42')
    expect(validateBeadsIssueId('bd-a3f8e9')).toBe('bd-a3f8e9')
    expect(validateBeadsIssueId('orca-0cc.9')).toBe('orca-0cc.9')
    expect(validateBeadsIssueId('A1')).toBe('A1')
  })

  it('rejects flag-smuggling ids that would reach bd argv', () => {
    expect(validateBeadsIssueId('-rf')).toBeNull()
    expect(validateBeadsIssueId('--db=x')).toBeNull()
    expect(validateBeadsIssueId('-')).toBeNull()
  })

  it('rejects empty and whitespace ids', () => {
    expect(validateBeadsIssueId('')).toBeNull()
    expect(validateBeadsIssueId('   ')).toBeNull()
    expect(validateBeadsIssueId('orca 42')).toBeNull()
    expect(validateBeadsIssueId('\torca-42')).toBeNull()
  })

  it('rejects unicode control and invisible characters', () => {
    expect(validateBeadsIssueId('\u0000')).toBeNull()
    expect(validateBeadsIssueId('orca\u0007-42')).toBeNull()
    expect(validateBeadsIssueId('\u200borca-42')).toBeNull()
    expect(validateBeadsIssueId('orca-42\n')).toBeNull()
  })

  it('rejects non-string input crossing the IPC boundary', () => {
    expect(validateBeadsIssueId(undefined)).toBeNull()
    expect(validateBeadsIssueId(null)).toBeNull()
    expect(validateBeadsIssueId(42)).toBeNull()
    expect(validateBeadsIssueId({ id: 'orca-42' })).toBeNull()
  })
})
