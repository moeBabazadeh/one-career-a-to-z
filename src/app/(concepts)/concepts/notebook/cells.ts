// The notebook as it ships: the career told in order, a markdown cell to introduce each part and
// code cells that compute it. Markdown carries names and prose read from db; every number on the
// page is printed by a code cell from the kernel's facts, never typed here.
import { db } from '../_shared/data';

export type CellType = 'code' | 'markdown';

export interface CellSource {
  id: string;
  type: CellType;
  source: string;
}

const md = (id: string, ...lines: string[]): CellSource => ({
  id,
  type: 'markdown',
  source: lines.join('\n'),
});
const code = (id: string, source: string): CellSource => ({
  id,
  type: 'code',
  source: source.replace(/^\n/, '').replace(/\n$/, ''),
});

const { person, current, education, awards } = db;
const { bsc } = education;
const lead = db.roles.neuroject;

export const DEFAULT_CELLS: CellSource[] = [
  md(
    'intro',
    `# ${person.name}`,
    '',
    `**${person.headline}.** ${person.tagline}`,
    '',
    'This notebook is live. The kernel starts with the facts loaded as records: `profile`, `roles`, `products`, `devices`, `oss` and `roots`. Every number on the page is computed by a cell below. Edit any cell and press <kbd>Shift</kbd> + <kbd>Enter</kbd> to run it again, or press <kbd>H</kbd> for the keyboard shortcuts.',
  ),
  code(
    'whoami',
    String.raw`
me = profile
print(f"{me.name} · {me.role} at {me.company}")
print(me.tagline, end="\n\n")
for paragraph in me.about:
    print(paragraph, end="\n\n")
print("Works in:", ", ".join(skills))

{"building since": me.since, "years": AS_OF.year - me.since}
`,
  ),
  md(
    'now-md',
    '## Now',
    '',
    `${lead.org} is ${lead.sector}, building ${current.pitch}. The cell asks the roles which ones have no end date yet.`,
  ),
  code(
    'now',
    String.raw`
current = [r for r in roles if r.end is None]
for r in current:
    kind = "contract" if r.contract else "full time"
    print(f"{r.org}: {r.title} ({kind}), since {r.began}")

lead = [r for r in current if not r.contract][0]
print()
for duty in lead.duties:
    print("•", duty)
`,
  ),
  md(
    'roles-md',
    '## Every role',
    '',
    'Oldest first. Each bar runs from the month a role began to the month it ended; a bar that reaches the dashed line is still running.',
  ),
  code(
    'timeline',
    String.raw`
plot.timeline(roles, label="org", note="title",
              title="Roles over time")
`,
  ),
  code(
    'tenure',
    String.raw`
def years_in(r):
    """Years in a role, up to the facts' date if it's still running."""
    return (r.end or NOW) - r.start

rows = [{"org": r.org, "title": r.title, "from": r.began,
         "to": r.ended or "now", "years": round(years_in(r), 1)}
        for r in reversed(roles)]
table(rows, title=f"{len(roles)} roles, newest first")
`,
  ),
  md(
    'products-md',
    '## Products',
    '',
    'What shipped, featured first. `table()` takes any list of records; click a column header in its output to sort by it.',
  ),
  code(
    'featured',
    String.raw`
featured = [p for p in products if p.featured]
for p in featured:
    print(p.title.upper())
    print(p.description)
    print(" · ".join(p.tech), "·", p.link or "no public link", end="\n\n")
`,
  ),
  code(
    'others',
    String.raw`
others = [p for p in products if not p.featured]
table(others, columns=["title", "description", "tech", "link"],
      title=f"{len(others)} more builds, sites and fixes")
`,
  ),
  code(
    'stores',
    String.raw`
both = [p.title for p in products
        if "app_store" in p.links and "play_store" in p.links]
print(f"On both app stores: {' and '.join(both)} ({len(both)} apps)")
`,
  ),
  md(
    'devices-md',
    '## Devices in production',
    '',
    'Hardware and firmware still in the field. Fleet figures are lower bounds as of the facts’ date, so the cell prints them with a +.',
  ),
  code(
    'devices',
    String.raw`
table(devices, columns=["tag", "name", "kind", "chip", "detail"])
`,
  ),
  code(
    'fleet',
    String.raw`
for d in devices:
    if not d.figures:
        continue
    print(d.name + (f" ({d.scope})" if d.scope else ""))
    for key, n in d.figures.items():
        print(f"  {key.replace('_', ' '):<16}{n:>13,}+")
    if d.record_years:
        print(f"  records over the past {d.record_years} years")
    if d.battery_months:
        print(f"  battery life    about {d.battery_months} months")
    print()

logged = sum(d.figures.get("records", 0) for d in devices)
print(f"Records logged by both fleets: {compact(logged)}+")
`,
  ),
  md(
    'oss-md',
    '## Open source',
    '',
    'Fixes merged upstream, in packages other people install every week. Each bar is one package’s weekly downloads.',
  ),
  code(
    'downloads',
    String.raw`
prs = sorted(oss, key=lambda c: c.weekly, reverse=True)
plot.bar([c.repo for c in prs], [c.weekly for c in prs],
         horizontal=True, title="Weekly downloads per patched package")
`,
  ),
  code(
    'prs',
    String.raw`
total = sum(c.weekly for c in prs)
print(f"{len(prs)} merged fixes, {total:,} downloads a week combined\n")
for c in prs:
    print(f"{c.repo} #{c.pr} · {c.kind}, {c.year}")
    print(f"  {c.change}")
    print(f"  {c.url}\n")
`,
  ),
  code(
    'reach',
    String.raw`
years = sorted({c.year for c in oss})
reach = [sum(c.weekly for c in oss if c.year <= y) for y in years]
plot.line(years, reach, ylabel="weekly downloads",
          title="Downloads covered by merged fixes, by the year of the fix")
`,
  ),
  md(
    'roots-md',
    `## Roots and ${awards.robocup.event.split(' ')[0]}`,
    '',
    `Before the web: ${bsc.field.toLowerCase()} with a focus on ${bsc.focus?.toLowerCase()} at ${bsc.school}, and robots, including ${awards.robocup.place} in the ${awards.robocup.challenge} at ${awards.robocup.event}.`,
  ),
  code(
    'roots-chart',
    String.raw`
dated = [r for r in roots if r.start]
plot.timeline(dated, label="title", color="kind",
              title="Education, robots, awards and papers")
`,
  ),
  code(
    'roots',
    String.raw`
for r in roots:
    print(r.when or "undated", "·", r.title)
    for extra in [r.detail, r.url]:
        if extra:
            print("  ", extra)
`,
  ),
  md(
    'contact-md',
    '## Contact',
    '',
    `The quickest way to reach ${person.first} is email. The CV has the long version.`,
    '',
    `[Email](mailto:${person.email}) · [LinkedIn](${person.linkedin}) · [GitHub](${person.github}) · [CV](${person.cv})`,
  ),
  code(
    'contact',
    String.raw`
for kind in ["email", "linkedin", "github", "cv"]:
    print(f"{kind:<10}{getattr(profile, kind)}")
`,
  ),
  code(
    'sandbox',
    String.raw`
# Your turn: edit this cell and press Shift+Enter.
# help() explains the kernel, dir() lists its names, roles[0]? inspects a record.
from collections import Counter
tech = Counter(t for p in products for t in p.tech)
sorted(tech.items(), key=lambda kv: -kv[1])[:5]
`,
  ),
];
