/** Error thrown for every spec-level problem. `location` is what the CLI prints
 *  so the user knows exactly where the spec is broken (a JSON path, or a
 *  line/column for unparsable YAML). */
export class SpecError extends Error {
  constructor(
    message: string,
    readonly location: string
  ) {
    super(`${message} (at ${location})`);
    this.name = "SpecError";
  }
}
