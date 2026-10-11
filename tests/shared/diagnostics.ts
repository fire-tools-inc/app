type DiagnosticLevel = 'warn' | 'error';

interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
}

export class TestDiagnostics {
  private entries: Diagnostic[] = [];

  record(level: DiagnosticLevel, args: readonly unknown[]): void {
    this.entries.push({ level, message: args.map(String).join(' ') });
  }

  consume(level: DiagnosticLevel, message: string, count = 1): void {
    const matches = this.entries.filter(entry => entry.level === level && entry.message.includes(message));
    if (matches.length !== count) {
      throw new Error(`Expected ${count} ${level} diagnostic(s) containing "${message}", received ${matches.length}.`);
    }
    this.entries = this.entries.filter(entry => !matches.includes(entry));
  }

  assertEmpty(): void {
    if (this.entries.length > 0) {
      const messages = this.entries.map(entry => `${entry.level}: ${entry.message}`).join('\n');
      throw new Error(`Unexpected test diagnostics. Assert deliberate failure-path logs with expectDiagnostic():\n${messages}`);
    }
  }

  clear(): void {
    this.entries = [];
  }
}

export const testDiagnostics = new TestDiagnostics();

export const expectDiagnostic = (level: DiagnosticLevel, message: string, count = 1): void =>
  testDiagnostics.consume(level, message, count);
