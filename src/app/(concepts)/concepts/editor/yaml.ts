// Front matter: the YAML subset the roles use (`key: value` pairs and lists of `- key: value`
// maps). The same steps as scripts/career.ts, so `npm run career` reads the roles exactly as the
// script in the repository would, and a broken edit fails the same way.

export interface YamlError {
  line: number;
  col: number;
  endCol: number;
  message: string;
}

export interface FrontMatter {
  data: Record<string, unknown>;
  /** 0-based lines of the opening and closing `---`. */
  open: number;
  close: number;
  errors: YamlError[];
}

export function frontMatter(text: string): FrontMatter | null {
  const lines = text.split('\n');
  if (lines[0] !== '---') return null;
  const close = lines.indexOf('---', 1);
  const errors: YamlError[] = [];
  if (close < 0) {
    errors.push({
      line: 0,
      col: 0,
      endCol: 3,
      message: 'Front matter is not closed: expected a line with ---.',
    });
    return { data: {}, open: 0, close: lines.length - 1, errors };
  }
  const data: Record<string, unknown> = {};
  let list: Record<string, string>[] | null = null;
  for (let n = 1; n < close; n++) {
    const line = lines[n];
    const item = /^\s+-\s+(\w+):\s*(.*)$/.exec(line);
    const field = /^\s+(\w+):\s*(.*)$/.exec(line);
    const pair = /^(\w+):\s*(.*)$/.exec(line);
    if (item && list) list.push({ [item[1]]: item[2] });
    else if (field && list && list.length) list[list.length - 1][field[1]] = field[2];
    else if (pair && pair[2] === '') data[pair[1]] = list = [];
    else if (pair) {
      if (pair[1] in data)
        errors.push({
          line: n,
          col: 0,
          endCol: pair[1].length,
          message: `Map keys must be unique: "${pair[1]}" is set twice.`,
        });
      data[pair[1]] = pair[2] === 'true' ? true : pair[2] === 'false' ? false : pair[2];
      list = null;
    } else if (line.trim() && !line.trim().startsWith('#')) {
      errors.push({
        line: n,
        col: line.length - line.trimStart().length,
        endCol: line.length,
        message: 'Implicit map keys need to be followed by map values.',
      });
    }
  }
  return { data, open: 0, close, errors };
}

/** A front matter value as one readable line, for the preview's table. */
export function yamlText(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((v) => (v && typeof v === 'object' ? Object.values(v).join(', from ') : String(v)))
      .join(' → ');
  return String(value);
}
