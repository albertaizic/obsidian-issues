# Security policy

## Supported versions

The latest release is the only supported version.

## Scope

Vault Issues runs entirely inside Obsidian on your own machine. It makes no
network requests, collects no telemetry, has no runtime dependencies, and reads
and writes only:

- Markdown files in the configured issues folder
- the `issues` frontmatter key of notes you explicitly link to an issue

The most likely class of security-relevant bug is therefore one where the
plugin writes outside those boundaries, destroys data it should not touch, or
mishandles a crafted filename or frontmatter value.

## Reporting a vulnerability

Please report privately rather than opening a public issue, via
[GitHub's private vulnerability reporting](https://github.com/albertaizic/obsidian-issues/security/advisories/new).

Include what you would put in a bug report — versions, operating system, and
steps to reproduce — plus what an attacker could achieve.

You can expect an acknowledgement within a couple of weeks. This is a
single-maintainer hobby project, so please be patient with fix timelines.
