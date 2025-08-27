export class Database {
  filename: string;
  private data: Map<string, any[]> = new Map();

  constructor(filename: string) {
    this.filename = filename;
  }

  query(sql: string) {
    return {
      all: (...params: any[]) => [],
      get: (...params: any[]) => null,
      run: (...params: any[]) => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  prepare(sql: string) {
    return {
      all: (...params: any[]) => [],
      get: (...params: any[]) => null,
      run: (...params: any[]) => ({ changes: 0, lastInsertRowid: 0 }),
    };
  }

  exec(sql: string) {
    return this;
  }

  close() {
    return;
  }
}
