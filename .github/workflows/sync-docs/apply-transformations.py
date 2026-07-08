#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
# SPDX-License-Identifier: Apache-2.0

"""Apply the transformations declared in transformations.yaml to the operator's Helm chart documentation files.

This is used by the sync-docs-to-website workflow to adapt the operator's Helm chart docs into the website docs.
The documentation is a set of files (the top-level README.md plus the topic files in docs/*.md); the transformations
themselves live in transformations.yaml, which is the first-class source of truth for how the docs are modified. This
script only knows how to apply them.

The README.md becomes dash0-operator/overview.md and the topic files move from docs/ into the same dash0-operator/
directory, so all synced pages end up as siblings; the relative links between them are rewritten accordingly.

For each file declared in transformations.yaml the script applies the common transformations, then the file-specific
transformations, then rewrites relative links pointing at renamed files or into renamed directories (dropping the
`.md` suffix, as the target website serves pages under extensionless URLs), then prepends a generated frontmatter
block, and finally writes the result to its target path inside the output directory.

Usage:
    apply-transformations.py <source-root> <transformations.yaml> <output-dir>

  source-root        Directory containing the source docs (helm-chart/dash0-operator); the `source` paths in
                     transformations.yaml are resolved relative to it.
  transformations.yaml  The transformation declarations.
  output-dir         Directory the transformed files are written into (created if necessary), using each entry's
                     `target` path.
"""

import datetime
import os
import re
import sys

import yaml

# Mapping from the flag names allowed in transformations.yaml to Python's re flags.
_FLAG_NAMES = {
    "multiline": re.MULTILINE,
    "dotall": re.DOTALL,
    "ignorecase": re.IGNORECASE,
}


def main(argv):
    if len(argv) != 4:
        raise SystemExit(f"usage: {argv[0]} <source-root> <transformations.yaml> <output-dir>")

    source_root, transformations_path, output_dir = argv[1], argv[2], argv[3]

    with open(transformations_path, encoding="utf-8") as transformations_file:
        config = yaml.safe_load(transformations_file)

    if not isinstance(config, dict):
        raise SystemExit("error: transformations.yaml must contain a top-level mapping with 'common' and 'files'")

    common = config.get("common") or []
    files = config.get("files") or []
    if not isinstance(common, list):
        raise SystemExit("error: 'common' in transformations.yaml must be a list of transformations")
    if not isinstance(files, list) or not files:
        raise SystemExit("error: 'files' in transformations.yaml must be a non-empty list of file entries")

    placeholders = _build_placeholders()

    for file_entry in files:
        _process_file(file_entry, common, source_root, output_dir, placeholders)


def _process_file(file_entry, common, source_root, output_dir, placeholders):
    source = file_entry["source"]
    target = file_entry["target"]
    source_path = os.path.join(source_root, source)

    with open(source_path, encoding="utf-8") as source_file:
        content = source_file.read()

    for index, transformation in enumerate(common, start=1):
        content = _apply(content, transformation, index, placeholders)
        print(f"[{source}] applied (common): {_describe(transformation, index)}")

    for index, transformation in enumerate(file_entry.get("transformations") or [], start=1):
        content = _apply(content, transformation, index, placeholders)
        print(f"[{source}] applied: {_describe(transformation, index)}")

    content = _rewrite_readme_links(content)
    content = _rewrite_docs_dir_links(content)
    content = _rewrite_intra_docs_links(content)
    content = _prepend_frontmatter(content, file_entry, placeholders)

    output_path = os.path.join(output_dir, target)
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as output_file:
        output_file.write(content)
    print(f"[{source}] wrote transformed document to {output_path}")


# The top-level README.md becomes the operator overview page dash0-operator/overview.md in the target repository (see
# transformations.yaml). The topic files move into that same dash0-operator/ directory, so a link from a topic file
# back to the README (`../README.md`) now points at a same-directory sibling. Group 1 captures the (now redundant)
# `./`/`../` prefix so it can be dropped, group 2 the optional anchor/query.
_README_LINK_PATTERN = re.compile(r"\]\(((?:\.{1,2}/)*)README\.md((?:#|\?)[^)]*)?\)")


def _rewrite_readme_links(content):
    """Rewrite relative markdown links that point at the renamed README.md to use overview instead.

    Only local relative links are rewritten: the link target must be the (optionally `./` or `../` prefixed)
    `README.md` (e.g. `](../README.md#supported-runtimes)` -> `](overview#supported-runtimes)`). The README becomes
    a same-directory sibling (dash0-operator/overview) of the topic files, so any `./`/`../` prefix is dropped. The
    `.md` suffix is dropped because the target website serves documentation pages under extensionless URLs. Any anchor
    or query is preserved. Absolute URLs that happen to end in README.md (e.g. https://github.com/.../README.md) are
    left untouched because they do not match the relative-prefix pattern.
    """
    return _README_LINK_PATTERN.sub(lambda m: f"](overview{m.group(2) or ''})", content)


# The source `docs/` directory is renamed to `dash0-operator/` in the target repository, the same directory the
# renamed README lands in (see transformations.yaml). A link from the README into `docs/` therefore becomes a
# same-directory sibling link. Group 1 captures the (now redundant) `./`/`../` prefix so it can be dropped, group 2
# the path after `docs/` (without any `.md` suffix), and group 3 the optional anchor/query.
_DOCS_DIR_LINK_PATTERN = re.compile(r"\]\(((?:\.{1,2}/)*)docs/([^)#?]*?)(?:\.md)?((?:#|\?)[^)]*)?\)")


def _rewrite_docs_dir_links(content):
    """Rewrite relative markdown links that point into the `docs/` directory to same-directory sibling links.

    Only local relative links are rewritten: the link path must start with the (optionally `./` or `../` prefixed)
    `docs/` segment (e.g. `](docs/configuration.md#anchor)` -> `](configuration#anchor)`). Because the renamed README
    (overview) and the topic files share the dash0-operator/ directory, the `docs/` segment and any `./`/`../` prefix
    are dropped, leaving a same-directory sibling link. The trailing `.md` suffix is dropped because the target website
    serves documentation pages under extensionless URLs; the path after `docs/` and any anchor or query are otherwise
    preserved (links into `docs/` that do not end in `.md` are still rewritten, just without a suffix to drop).
    Absolute URLs that happen to contain a `docs/` path segment (e.g. https://kubernetes.io/docs/...) are left
    untouched because they do not match the relative-prefix pattern.
    """
    return _DOCS_DIR_LINK_PATTERN.sub(lambda m: f"]({m.group(2)}{m.group(3) or ''})", content)


# Sibling links between the topic files keep their target file name but must drop the `.md` suffix. The topic files
# move together (docs/ -> dash0-operator/), so these same-directory links keep pointing at the right page; only the
# extension changes. Group 1 captures the optional `./` prefix, group 2 the bare file name, group 3 the optional
# anchor/query.
_INTRA_DOCS_LINK_PATTERN = re.compile(r"\]\((\./)?([^)/:?#]+)\.md((?:#|\?)[^)]*)?\)")


def _rewrite_intra_docs_links(content):
    """Drop the `.md` suffix from relative same-directory markdown links between topic files.

    Only bare same-directory links are rewritten: the target must be a plain file name, optionally prefixed with `./`
    (e.g. `](configuration.md#enable-dash0-monitoring-for-a-namespace)` -> `](configuration#…)`). The `.md` suffix is
    dropped because the target website serves documentation pages under extensionless URLs. Links that cross a rename
    boundary (`../README.md`, `docs/…`) are handled separately and are not matched here, and absolute URLs are left
    untouched because they contain a `:` (and a `/`) before the `.md`.
    """
    return _INTRA_DOCS_LINK_PATTERN.sub(lambda m: f"]({m.group(1) or ''}{m.group(2)}{m.group(3) or ''})", content)


def _prepend_frontmatter(content, file_entry, placeholders):
    """Prepend the generated frontmatter block (title, description, lastUpdated) to the document."""
    title = file_entry.get("title")
    description = file_entry.get("description")
    if not title or not description:
        raise SystemExit(f"error: file entry for {file_entry.get('source')!r} must define 'title' and 'description'")

    frontmatter = (
        "---\n"
        f"title: {title}\n"
        f"description: {description}\n"
        f"lastUpdated: {placeholders['$timestamp']}\n"
        "---\n"
    )
    # Drop any leading blank lines left behind by the transformations before attaching the frontmatter.
    return frontmatter + content.lstrip("\n")


def _build_placeholders():
    """Build the placeholder values that can be referenced in the inserted/replacement text.

    The values are computed once per run so that every occurrence of a placeholder renders consistently. Currently the
    only supported placeholder is $timestamp, which renders the current UTC date/time, e.g. "2026-04-20T05:00:00.000Z".
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    return {"$timestamp": timestamp}


def _apply(content, transformation, index, placeholders):
    description = _describe(transformation, index)
    transformation_type = transformation.get("type")
    required = transformation.get("required", True)

    if transformation_type == "prepend":
        return _substitute_placeholders(transformation["content"], placeholders) + content

    if transformation_type == "replace-regex":
        pattern = re.compile(transformation["find"], _compile_flags(transformation))
        replace = _substitute_placeholders(transformation["replace"], placeholders)
        new_content, count = pattern.subn(replace, content)
        if count == 0 and required:
            raise SystemExit(f"error: replace-regex transformation matched nothing: {description}")
        return new_content

    if transformation_type == "remove-line":
        return _remove_line(content, transformation, description, required)

    raise SystemExit(f"error: unknown transformation type {transformation_type!r}: {description}")


def _describe(transformation, index):
    """Return a human-readable label for a transformation, used in log output and error messages."""
    return transformation.get("description", f"transformation #{index}")


def _compile_flags(transformation):
    flags = 0
    for name in transformation.get("flags", []):
        if name not in _FLAG_NAMES:
            raise ValueError(f"unknown regex flag {name!r}; allowed flags: {sorted(_FLAG_NAMES)}")
        flags |= _FLAG_NAMES[name]
    return flags


def _substitute_placeholders(text, placeholders):
    for placeholder, value in placeholders.items():
        text = text.replace(placeholder, value)
    return text


def _remove_line(content, transformation, description, required):
    """Remove the line matching the given literal.

    The `line` value is matched as a literal substring; the whole line(s) containing its first occurrence are removed.
    If the removal leaves multiple consecutive empty lines behind, they are normalized to a single empty line.
    """
    marker = transformation["line"]

    marker_index = content.find(marker)
    if marker_index == -1:
        if required:
            raise SystemExit(f"error: remove-line transformation did not find 'line' marker: {description}")
        return content

    # Expand the removal span to whole lines: back to the start of the line containing the marker and forward to the
    # end of the line where the marker ends (including its trailing newline, if any).
    line_start = content.rfind("\n", 0, marker_index) + 1
    line_end = content.find("\n", marker_index + len(marker))
    line_end = len(content) if line_end == -1 else line_end + 1

    new_content = content[:line_start] + content[line_end:]

    # Normalize runs of multiple empty lines (three or more consecutive newlines) down to a single empty line.
    new_content = re.sub(r"\n{3,}", "\n\n", new_content)
    return new_content


if __name__ == "__main__":
    main(sys.argv)
