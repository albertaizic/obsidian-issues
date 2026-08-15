---
name: no-co-author-trailer
description: User wants Claude to NOT add Co-Authored-By trailers to commit messages
type: feedback
---

**Rule:** Never add a `Co-Authored-By: Claude ...` trailer to git commit messages.

**Why:** The user noticed it appearing and does not want it.

**How to apply:** When creating commits, write a plain `git commit -m "..."` with no Co-Authored-By trailer. This applies to all repos for this user.
