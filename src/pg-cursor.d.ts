/** Minimal ambient types for pg-cursor (no @types package published). */
declare module "pg-cursor" {
  import type { Submittable, QueryResultRow, FieldDef } from "pg";

  export default class Cursor<R extends QueryResultRow = any> implements Submittable {
    constructor(text: string, values?: unknown[]);
    submit: (connection: unknown) => void;
    read(
      rowCount: number,
      callback: (err: Error | undefined, rows: R[], result: { fields?: FieldDef[] }) => void,
    ): void;
    close(callback?: (err?: Error) => void): void;
  }
}
