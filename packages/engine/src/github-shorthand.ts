/**
 * Expand a `github:` / `gh:` source shorthand into a
 * `raw.githubusercontent.com` URL. The form is
 * `github:OWNER/REPO[.git]/PATH...[#REF]` (with `gh:` as a shorter alias),
 * expanding to `https://raw.githubusercontent.com/OWNER/REPO/REF/PATH`.
 *
 * `REF` defaults to `HEAD` — GitHub's raw host resolves that to the repo's
 * default branch, so no API call is needed to discover `main` vs `master`.
 * Pin a branch, tag, or commit with a trailing `#REF`, e.g.
 * `github:owner/repo/data.json#v1.2.0`. Sources that aren't a `github:` /
 * `gh:` shorthand are returned unchanged.
 *
 * Shared by the CLI's `--input` parsing and the playground's URL
 * loaders so the two surfaces accept identical shorthands.
 */
export function expandGitHubShorthand(source: string): string {
  const m = /^(?:github|gh):(.*)$/s.exec(source);
  if (!m) return source;

  const spec = m[1]!;
  const hashIdx = spec.indexOf("#");
  const pathPart = hashIdx === -1 ? spec : spec.slice(0, hashIdx);
  const ref = hashIdx === -1 ? "HEAD" : spec.slice(hashIdx + 1);

  if (hashIdx !== -1 && ref === "") {
    throw new Error(`empty ref after '#' in GitHub source '${source}'`);
  }
  const segments = pathPart.split("/").filter((s) => s !== "");
  if (segments.length < 3) {
    throw new Error(
      `expected github:OWNER/REPO/PATH (e.g. github:owner/repo/data.json), got '${source}'`,
    );
  }

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, "");
  const path = segments.slice(2).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
}
