#!/usr/bin/env python3
"""Auto-resolve merge conflicts — DISCOVER step.

Emits the set of PRs the resolve job should process, as a compact JSON array of
``{number, head_ref, base_ref}`` written to ``$GITHUB_OUTPUT`` as ``prs=...``.

Scope mirrors the merge-conflict labeler, because the same event set creates the
conflicts: with ``PR_NUMBER`` set (a pull_request event) it considers that one
PR; unset (a push to the base branch) it scans every open PR. A base-branch
advance emits NO pull_request event and does NOT re-fire the ``labeled`` event
for a PR that already carries the label, so the push scan is the only thing that
reaches a PR whose conflict was introduced from underneath it.

Only PRs the resolver is allowed to touch are emitted: open, not draft, same-repo
head (a fork's token is read-only and its author is untrusted), and mergeability
CONFLICTING. Bot-authored PRs ARE eligible — this repo's own automation opens
many PRs, template-sync among them, and the resolved head is re-validated by CI
and human review before it can merge. The one exception is the dependency-update
bots (:data:`DEPENDENCY_BOT_AUTHORS`): dependabot rebases its own conflicts and
stops managing a PR the moment anyone else pushes to it, so a resolve there buys
nothing and costs both an LLM run and dependabot's own upkeep of the branch.

Two further filters bound what the resolver spends, and both are keyed to the
PR's OWN activity rather than to the clock: a PR whose head commit is older than
``AUTO_RESOLVE_MAX_COMMIT_AGE_HOURS`` is out of scope, and a PR whose current
head commit the resolver already ran against is skipped. Together they mean a
base-branch push can trigger at most ONE resolve per PR head, and only on
branches someone is actively pushing to. Both are overridable for a
human-dispatched catch-up over a backlog:
``AUTO_RESOLVE_MAX_COMMIT_AGE_HOURS=0`` disables the window,
``AUTO_RESOLVE_IGNORE_ATTEMPT_MARK=true`` drops the per-head mark.

GitHub computes mergeability lazily (a fresh query can report UNKNOWN), so a
candidate that is neither MERGEABLE nor CONFLICTING is re-queried up to
``MAX_PASSES`` times before it is dropped for this run — the next event or the
labeler's own cron retries it.

This module imports the standard library and its own directory's ``_ci_retry``
only. The discover job checks out ``.github/scripts`` sparsely and runs on the
system ``python3``, so it can reach nothing outside that tree and no virtual
environment.
"""

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _ci_retry import (  # noqa: E402  # pylint: disable=wrong-import-position
    base_delay,
    retry_max,
    with_retry,
)

_HERE = Path(__file__).resolve().parent

# The names bash also spells. `lib/shared-names.bash` reads this same file with
# `jq`, so a rename reaches the bash writers and this Python reader at once — a
# reader querying a label or a status context nobody writes finds nothing and
# reports the PR unlabelled and the head unmarked, which is silent in production.
_SHARED_NAMES = json.loads(
    (_HERE.parent / "lib" / "shared-names.json").read_text(encoding="utf-8")
)

# The opt-out label, applied by the auto-resolve steps whose outcome a re-run
# cannot change without a human (land's unpushable merge, handoff's unmergeable
# conflict). Read here to drop the PR from every later scan, so a base push does
# not re-run a paid LLM resolve into the same wall.
PR_LABEL_AUTO_RESOLVE_BLOCKED = _SHARED_NAMES["pr_labels"]["auto_resolve_blocked"]

# The per-head attempt mark, written as a commit STATUS by the resolve job. A
# status attaches to the commit, so pushing new commits clears it by
# construction. A later status on the `-released` context cancels a mark whose
# run spent nothing.
ATTEMPT_CONTEXT = _SHARED_NAMES["commit_status_marks"]["auto_resolve_attempt"]
RELEASED_SUFFIX = _SHARED_NAMES["commit_status_marks"]["released_suffix"]

# The dependency-update bots whose PRs the resolver leaves alone. Dependabot
# stops managing a PR that anyone else alters ("Dependabot will resolve any
# conflicts with this PR as long as you don't alter it yourself"), so pushing a
# conflict resolution onto its branch disables the rebase it would have done
# itself — and costs an LLM resolve to do it. Named WITHOUT the ``[bot]`` /
# ``app/`` decoration GitHub adds, which :func:`_bare_login` strips before the
# membership test.
DEPENDENCY_BOT_AUTHORS = frozenset({"dependabot", "dependabot-preview", "renovate"})

# How many open PRs one listing page carries. High enough that a normal repo
# never reaches it, and a sweep that DOES reach it says so rather than quietly
# under-sweeping.
PR_SWEEP_LIMIT_DEFAULT = 200

# The `gh pr list --json` field set the scan reads. `commits` is deliberately
# absent: it pulls each commit's `authors` connection, so GitHub's node estimate
# for the listing is PRs x commits x authors, which blows past the API's node
# ceiling on a busy repo and takes every push-scan discovery down with it. The
# head commit's date is fetched per candidate instead.
LISTING_FIELDS = (
    "number,mergeable,isDraft,isCrossRepository,headRefName,"
    "headRefOid,baseRefName,state,labels,author"
)

# Every mergeability GitHub is known to report. The scan acts on two of them and
# retries the third, so a value outside this set is the one input that would pass
# through the whole scan without any code claiming it: `is_undecided` is written
# as "not the two decided values", which silently absorbs a fourth.
KNOWN_MERGEABILITY = frozenset({"MERGEABLE", "CONFLICTING", "UNKNOWN"})


class DiscoverError(RuntimeError):
    """A condition the scan cannot proceed past.

    Carries the operator-facing line the workflow log shows; :func:`main` turns
    it into an exit status at the process boundary and nowhere else. ``plain``
    marks a message that must NOT carry the ``::error::`` annotation, which
    GitHub renders as a run-level error.
    """

    def __init__(self, message: str, *, plain: bool = False) -> None:
        super().__init__(message)
        self.plain = plain


def _iso_to_epoch(stamp: str) -> float:
    """Seconds since the epoch for a GitHub ISO-8601 UTC timestamp.

    Strict on purpose: a stamp this cannot parse raises rather than reading as
    some default time. A silently-defaulted date would move a PR into or out of
    the age window on evidence that does not exist.
    """
    try:
        parsed = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as error:
        raise DiscoverError(
            f"auto-resolve-discover: cannot read the timestamp '{stamp}' — {error}"
        ) from None
    return parsed.replace(tzinfo=timezone.utc).timestamp()


def _bare_login(login: str) -> str:
    """An author login without GitHub's bot decoration.

    ``app/dependabot`` (GraphQL) and ``dependabot[bot]`` (REST) name one account,
    so both spellings must reduce to the same string before the membership test.
    """
    return login.removeprefix("app/").removesuffix("[bot]")


@dataclass(frozen=True)
class PullRequest:
    """One PR as the listing reports it, plus the head-commit date the age window
    reads. A record with fields, so each predicate below names what it tests
    instead of re-deriving it from a JSON blob."""

    number: int
    head_ref: str
    base_ref: str
    head_sha: str
    state: str
    is_draft: bool
    is_cross_repository: bool
    mergeable: str
    labels: tuple[str, ...]
    author_login: str
    # Empty means the date was never fetched or came back blank — no evidence of
    # recent activity, which the window spends on NOT resolving the PR.
    head_commit_date: str = ""

    @classmethod
    def from_listing(cls, row: dict) -> "PullRequest":
        return cls(
            number=row["number"],
            head_ref=row["headRefName"],
            base_ref=row["baseRefName"],
            head_sha=row["headRefOid"],
            state=row["state"],
            is_draft=row["isDraft"],
            is_cross_repository=row["isCrossRepository"],
            mergeable=row["mergeable"],
            labels=tuple(label["name"] for label in row["labels"]),
            author_login=(row.get("author") or {}).get("login") or "",
        )

    def with_commit_date(self, stamp: str) -> "PullRequest":
        return replace(self, head_commit_date=stamp)

    @property
    def is_open(self) -> bool:
        return self.state == "OPEN"

    @property
    def is_conflicting(self) -> bool:
        return self.mergeable == "CONFLICTING"

    @property
    def is_undecided(self) -> bool:
        """GitHub computes mergeability lazily, so neither verdict yet."""
        return self.mergeable not in ("MERGEABLE", "CONFLICTING")

    @property
    def is_dependency_bot(self) -> bool:
        return _bare_login(self.author_login) in DEPENDENCY_BOT_AUTHORS

    @property
    def is_blocked(self) -> bool:
        return PR_LABEL_AUTO_RESOLVE_BLOCKED in self.labels

    def within_age_window(self, max_age_secs: int) -> bool:
        """True when someone pushed to this branch inside the window.

        The window measures the branch's activity, not its birthday: a conflict
        on a branch someone pushed to today is usually the base moving under
        active work, which is what the resolver is good at, while a branch nobody
        has touched in a day has a conflict that will still be there — and still
        need the human judgment the resolver cannot supply — after another paid
        attempt. ``max_age_secs == 0`` disables the window. An unknown head date
        is no evidence of recent activity, and the doubt is spent on NOT
        resolving the PR.
        """
        if max_age_secs == 0:
            return True
        if not self.head_commit_date:
            return False
        return _iso_to_epoch(self.head_commit_date) > time.time() - max_age_secs


# The two accepted number shapes, spelled as regexes rather than `str.isdigit`.
# `isdigit` is true for superscripts and for non-ASCII digit scripts, so it would
# accept a value `int()` then rejects. A knob whose validator and parser disagree
# fails inside the run instead of at its own check.
_WHOLE = re.compile(r"[0-9]+")
_POSITIVE = re.compile(r"[1-9][0-9]*")


def _whole_int(raw: str, message: str) -> int:
    if not _WHOLE.fullmatch(raw):
        raise DiscoverError(f"{message}, got '{raw}'.")
    return int(raw)


def _positive_int(raw: str, message: str) -> int:
    if not _POSITIVE.fullmatch(raw):
        raise DiscoverError(f"{message}, got '{raw}'.")
    return int(raw)


@dataclass(frozen=True)
class Config:
    """Every knob one scan reads, resolved once from the environment.

    A parameter object rather than a bag of module globals: the predicates below
    take the config they consult, so a caller cannot reach a knob the signature
    does not name.

    Every knob reads its default through ``or``, so an EMPTY value is the same as
    an unset one. A workflow passes an unset repository variable as the empty
    string, and a shell ``${X:-default}`` would take that empty string as the
    value — which is how an adopter who never set a variable gets a run that
    fails on a knob they have never heard of.
    """

    repo: str
    output_path: str
    pr_number: str | None
    max_commit_age_hours: int
    max_age_secs: int
    max_passes: int
    retry_delay_secs: float
    ignore_attempt_mark: bool
    attempt_ttl_secs: int
    sweep_limit: int
    retry_max: int
    retry_base_delay: float

    @classmethod
    def from_env(cls, env: dict[str, str]) -> "Config":
        for required in ("REPO", "GH_TOKEN", "GITHUB_OUTPUT"):
            if not env.get(required):
                raise DiscoverError(f"{required} required", plain=True)
        # How long one attempt suppresses the next against the SAME head. To
        # ignore the mark entirely for one run use AUTO_RESOLVE_IGNORE_ATTEMPT_MARK
        # rather than a zero here, which is why zero is refused. The default of 6
        # bounds spend at four attempts per head (the 24h window / the 6h TTL).
        ttl_hours = _positive_int(
            env.get("AUTO_RESOLVE_ATTEMPT_TTL_HOURS") or "6",
            "AUTO_RESOLVE_ATTEMPT_TTL_HOURS must be a positive whole number of hours",
        )
        age_hours = _whole_int(
            env.get("AUTO_RESOLVE_MAX_COMMIT_AGE_HOURS") or "24",
            "AUTO_RESOLVE_MAX_COMMIT_AGE_HOURS must be a whole number of hours",
        )
        sweep_limit = _positive_int(
            env.get("SWEEP_PR_LIMIT") or str(PR_SWEEP_LIMIT_DEFAULT),
            "SWEEP_PR_LIMIT must be a positive whole number of PRs",
        )
        return cls(
            repo=env["REPO"],
            output_path=env["GITHUB_OUTPUT"],
            pr_number=env.get("PR_NUMBER") or None,
            max_commit_age_hours=age_hours,
            max_age_secs=age_hours * 3600,
            max_passes=_positive_int(
                env.get("MAX_PASSES") or "3",
                "MAX_PASSES must be a positive whole number of passes",
            ),
            retry_delay_secs=float(env.get("RETRY_DELAY_SECS") or "10"),
            # Only the exact string opens the bypass. Anything else — "false",
            # "", a typo — leaves the per-head mark enforcing, because this knob
            # restores the per-push resolve cost the mark exists to bound.
            ignore_attempt_mark=env.get("AUTO_RESOLVE_IGNORE_ATTEMPT_MARK") == "true",
            attempt_ttl_secs=ttl_hours * 3600,
            sweep_limit=sweep_limit,
            retry_max=retry_max(env),
            retry_base_delay=base_delay(env),
        )


@dataclass
class Gh:
    """Every call this scan makes to the GitHub CLI, with the shared retry.

    A flaky network step (an API 5xx blip) is re-tried with exponential backoff,
    while a genuine failure still exhausts the cap and raises — fail loud."""

    config: Config

    def run_gh(self, args: list[str]) -> str:
        """Run one ``gh`` call and return its stdout, re-running on nonzero exit
        with exponential backoff.

        Raises :class:`DiscoverError` once the cap is exhausted. This refusal is
        what stops a failed read from degrading into an empty result the caller
        reads as a clean repo."""
        shown = " ".join(["gh", *args])

        def once() -> subprocess.CompletedProcess:
            return subprocess.run(
                ["gh", *args], stdout=subprocess.PIPE, check=False, text=True
            )

        def give_up() -> NoReturn:
            raise DiscoverError(f"gh call failed: {shown}", plain=True)

        done = with_retry(
            shown,
            once,
            give_up,
            maximum=self.config.retry_max,
            delay=self.config.retry_base_delay,
        )
        return done.stdout

    def scoped_prs(self) -> list[PullRequest]:
        """The PR rows for the current scope: with ``PR_NUMBER`` set the one PR
        it names, else every open PR. One scope switch, so an event-scoped run
        and a full sweep hand their caller the same shape."""
        if self.config.pr_number:
            raw = self.run_gh(
                [
                    "pr",
                    "view",
                    self.config.pr_number,
                    "--repo",
                    self.config.repo,
                    "--json",
                    LISTING_FIELDS,
                ]
            )
            return [PullRequest.from_listing(json.loads(raw))]
        raw = self.run_gh(
            [
                "pr",
                "list",
                "--repo",
                self.config.repo,
                "--state",
                "open",
                "--limit",
                str(self.config.sweep_limit),
                "--json",
                LISTING_FIELDS,
            ]
        )
        rows = json.loads(raw)
        # A full page means the repo may have more open PRs than this sweep can
        # see, so the excess would silently never be swept. Say so rather than
        # quietly under-sweep — no silent caps.
        if len(rows) >= self.config.sweep_limit:
            print(
                f"::warning::auto-resolve-discover: the open-PR listing hit the "
                f"{self.config.sweep_limit}-PR cap, so PRs beyond it are not "
                "swept. Raise SWEEP_PR_LIMIT."
            )
        return [PullRequest.from_listing(row) for row in rows]

    def head_commit_date(self, sha: str) -> str:
        """The head commit's committer date — one un-paginated read with no node
        ceiling, which is what the age window asks for (see LISTING_FIELDS).

        Returns "" when the API carried no date. `gh --jq` renders an absent
        field as the literal ``null``, so that string is the absent case and not
        a malformed date: passing it on would make the window's strict parse fail
        the whole sweep over one commit GitHub gave no date for."""
        raw = self.run_gh(
            [
                "api",
                f"repos/{self.config.repo}/commits/{sha}",
                "--jq",
                ".commit.committer.date",
            ]
        ).strip()
        return "" if raw == "null" else raw

    def commit_statuses(self, sha: str) -> object:
        return json.loads(
            self.run_gh(["api", f"repos/{self.config.repo}/commits/{sha}/statuses"])
            or "null"
        )


def _newest_status(statuses: object, context: str) -> float:
    """The newest ``created_at`` on CONTEXT as epoch seconds, or 0 when absent."""
    if not isinstance(statuses, list):
        return 0.0
    stamps = [
        _iso_to_epoch(entry["created_at"])
        for entry in statuses
        if entry.get("context") == context
    ]
    return max(stamps, default=0.0)


@dataclass
class Probes:
    """The per-candidate probe: one API call, run only on the few PRs every
    cheaper filter already accepted."""

    gh: Gh
    config: Config

    def already_attempted(self, sha: str) -> bool:
        """True when SHA carries an attempt mark that is still FRESH and no later
        release cancels it.

        A mark older than the TTL is treated as no mark: whatever the earlier run
        concluded, the code that concluded it may since have been fixed, and
        nothing else would ever retry this tree. A query that fails answers "not
        fresh" — the cost of a redundant attempt is one run, while wrongly
        reporting "fresh" would silently strand a head the resolver should
        handle. A release stamped in the same second as the mark it cancels wins,
        for the same reason.
        """
        if self.config.ignore_attempt_mark:
            return False
        # The read AND the stamp parse are both inside: an unreadable status list
        # and an unparsable created_at answer the same question equally badly,
        # and both take the same "not fresh" answer for the same reason.
        try:
            statuses = self.gh.commit_statuses(sha)
            marked = _newest_status(statuses, ATTEMPT_CONTEXT)
            released = _newest_status(statuses, f"{ATTEMPT_CONTEXT}{RELEASED_SUFFIX}")
        except DiscoverError as error:
            print(f"::warning::attempt mark unreadable for {sha}: {error}")
            return False
        return marked > time.time() - self.config.attempt_ttl_secs and released < marked


@dataclass
class Scan:
    """One discover run. Holds the state the retry passes share, so nothing is
    threaded through module globals."""

    config: Config
    gh: Gh
    candidates: list[PullRequest] = field(default_factory=list)

    def emittable(self, pr: PullRequest) -> bool:
        """Every rail the resolver must clear before it may touch a PR."""
        return (
            pr.is_open
            and not pr.is_draft
            and not pr.is_cross_repository
            and pr.is_conflicting
            and not pr.is_dependency_bot
            and not pr.is_blocked
            and pr.within_age_window(self.config.max_age_secs)
        )

    def still_undecided(self, pr: PullRequest) -> bool:
        """A PR that could still flip to CONFLICTING and be emitted.

        Deliberately NOT gated on the opt-out label: a labelled PR is dropped
        from the emit set anyway, and waiting on its mergeability would burn a
        retry pass for a verdict nothing acts on."""
        return (
            pr.is_open
            and not pr.is_draft
            and not pr.is_cross_repository
            and not pr.is_dependency_bot
            and pr.within_age_window(self.config.max_age_secs)
            and pr.is_undecided
        )

    def with_commit_dates(self, prs: list[PullRequest]) -> list[PullRequest]:
        """Attach the head-commit date to each candidate that could still be
        emitted — one read per PR — and leave the rest with none.

        A MERGEABLE PR is dropped before the window is ever read, so it is not
        fetched: the extra calls are bounded by the number of conflicted or
        undecided PRs, not by the repo's open-PR count."""
        return [
            pr.with_commit_date(self.gh.head_commit_date(pr.head_sha))
            if pr.mergeable != "MERGEABLE"
            else pr
            for pr in prs
        ]

    def conflicted(self, keep) -> list[int]:
        """The open conflicted PR numbers KEEP accepts, in listing order."""
        return [
            pr.number
            for pr in self.candidates
            if pr.is_open and pr.is_conflicting and keep(pr)
        ]

    def collect(self) -> list[PullRequest]:
        """Run the retry passes and return the PRs the emit filter accepts.

        GitHub computes mergeability lazily, so a candidate that is neither
        MERGEABLE nor CONFLICTING is re-queried until it settles or the passes
        run out. Only an eligible-but-undecided PR holds the loop: one that is
        out of the window or bot-authored is not going to be emitted however its
        mergeability settles, so waiting on it would just burn the passes."""
        emitted: list[PullRequest] = []
        for pass_number in range(1, self.config.max_passes + 1):
            if pass_number > 1:
                time.sleep(self.config.retry_delay_secs)
            self.candidates = self.with_commit_dates(self.gh.scoped_prs())
            emitted = [pr for pr in self.candidates if self.emittable(pr)]
            if not any(self.still_undecided(pr) for pr in self.candidates):
                break
        return emitted


def report_unrecognized_mergeability(candidates: list[PullRequest]) -> None:
    """Say so when GitHub reported a mergeability this scan does not model.

    Such a value is treated as undecided, so the scan re-queries it for every
    pass and then drops the PR — the same outcome a genuinely-undecided PR gets,
    and indistinguishable from it in the log. That is the failure this reports: a
    PR that can never be resolved, dropping quietly on every scan forever, with
    nothing naming the reason. The scan still completes, because retrying is the
    safe reading of an unknown answer; what changes is that somebody now learns
    the set needs a new member."""
    unrecognized = sorted(
        {pr.mergeable for pr in candidates if pr.mergeable not in KNOWN_MERGEABILITY}
    )
    if unrecognized:
        print(
            f"::warning::GitHub reported mergeability {', '.join(unrecognized)}, "
            "which auto-resolve does not model. Those PRs are treated as "
            "undecided and dropped from this scan. Add the value to "
            "KNOWN_MERGEABILITY in auto-resolve/discover.py once its meaning is "
            "settled."
        )


def _render(numbers: list[int]) -> str:
    """The bracketed, comma-joined number list every skip line reports."""
    return "[" + ",".join(str(n) for n in numbers) + "]"


def _emit_entry(pr: PullRequest) -> dict:
    """The record the resolve and land jobs consume. Exactly three keys: the head
    SHA the attempt filter needed never reaches the matrix."""
    return {"number": pr.number, "head_ref": pr.head_ref, "base_ref": pr.base_ref}


def run(config: Config) -> None:
    """One discover run, from the listing to the written output."""
    gh = Gh(config)
    scan = Scan(config, gh)
    probes = Probes(gh, config)

    accepted = scan.collect()
    report_unrecognized_mergeability(scan.candidates)

    if config.ignore_attempt_mark:
        print(
            "AUTO_RESOLVE_IGNORE_ATTEMPT_MARK=true — re-running against heads the "
            "resolver already attempted."
        )

    # One probe per accepted PR, and each PR lands in exactly one list — so a
    # skipped PR cannot also be emitted, and the probe cannot run twice.
    eligible: list[PullRequest] = []
    attempted: list[int] = []
    for pr in accepted:
        if probes.already_attempted(pr.head_sha):
            attempted.append(pr.number)
        else:
            eligible.append(pr)
    if attempted:
        print(
            f"Skipping PR(s) {_render(attempted)} — auto-resolve already ran "
            "against the current head commit; push a new commit to re-enable it."
        )

    blocked = scan.conflicted(lambda pr: pr.is_blocked)
    if blocked:
        print(
            f"Skipping {PR_LABEL_AUTO_RESOLVE_BLOCKED} PR(s) {_render(blocked)} — "
            "remove the label to re-enable auto-resolve for them."
        )

    aged_out = scan.conflicted(lambda pr: not pr.within_age_window(config.max_age_secs))
    if aged_out:
        print(
            f"Skipping PR(s) {_render(aged_out)} — no commit in the last "
            f"{config.max_commit_age_hours}h, outside the auto-resolve window "
            "(AUTO_RESOLVE_MAX_COMMIT_AGE_HOURS)."
        )

    prs = json.dumps([_emit_entry(pr) for pr in eligible], separators=(",", ":"))
    print(f"Auto-resolve will process: {prs}")
    with open(config.output_path, "a", encoding="utf-8") as handle:
        handle.write(f"prs={prs}\n")


def main() -> None:
    try:
        run(Config.from_env(dict(os.environ)))
    except DiscoverError as error:
        prefix = "" if error.plain else "::error::"
        print(f"{prefix}{error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
