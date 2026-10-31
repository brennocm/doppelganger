# Requirements Document

## Introduction

This spec covers everything the judges receive: the public repository, the live demo URL, the video (3 minutes max) and the write-up on how Kiro was used. The deadline is 4 December 2026. Every claim in these materials must be backed by the repository, the journal or an evaluation report.

## Glossary

- **Write_Up**: `docs/KIRO.md`, the detailed account of how Kiro was used, also pasted into the submission form.
- **Video**: the public YouTube video, at most 3:00.
- **Journal**: `docs/kiro-journal.md`.
- **Submission_Form**: the hackathon's submission page.

## Requirements

### Requirement 1: Repository readiness

**User Story:** As a judge, I want a repository I can understand and run.

#### Acceptance Criteria

1. THE repository SHALL be public, with an OSI-approved license (MIT) detected by GitHub and shown in the About section.
2. THE `.kiro/` directory SHALL be committed with its steering, specs, hooks, agents and MCP settings, and SHALL NOT be git-ignored.
3. THE `README.md` SHALL include: the one-line description, the live demo link, the video link, a screenshot, the three tiers with run instructions, the limits, and links to the Write_Up and model card.
4. THE repository history SHALL contain no secrets or personal data, verified by a full-history gitleaks run.

### Requirement 2: Write-up

**User Story:** As a judge, I want to understand how deeply and effectively Kiro was used.

#### Acceptance Criteria

1. THE Write_Up SHALL contain one section per Kiro feature, each answering the hackathon's questions:
   1. Kiro surfaces (IDE, CLI, Web, Crew): which were used and how they differed.
   2. Custom agents: which ones, in which Kiro app, and their impact.
   3. Agent hooks: which workflows were automated and how they changed development.
   4. Spec-driven development: how specs were structured, how it improved development, and how it compared to vibe coding.
   5. Steering: how it improved responses and which strategy made the biggest difference.
   6. MCP: how the servers (third-party and the custom Doppelganger MCP) extended Kiro, and what they made possible.
   7. Property-based testing: which requirements had properties and which bugs PBT caught that unit tests missed.
   8. Kiro powers: which powers were used, and the custom Doppelgänger power.
2. EACH section SHALL cite at least one concrete example with a link to a file, commit or journal entry.
3. THE Write_Up SHALL include setbacks and what was changed because of them.
4. THE Write_Up SHALL contain only facts recorded in the Journal or verifiable in the repository.

### Requirement 3: Video

**User Story:** As a judge, I want a clear, gripping 3-minute story.

#### Acceptance Criteria

1. THE Video SHALL be at most 3:00 long, public on YouTube, with English captions.
2. THE Video SHALL follow the script in the design: the threat, a genuine call, the clone and the possession, the protocol, privacy proof, how Kiro built it.
3. THE Video SHALL show the real app; replay segments SHALL be labelled on screen as replays.
4. THE Video SHALL use only clones of the author's own voice, with an on-screen consent note.
5. THE Video SHALL include no copyrighted music or third-party marks beyond nominative use of the Kiro name.

### Requirement 4: Submission form

**User Story:** As the entrant, I want a complete, consistent submission.

#### Acceptance Criteria

1. THE Submission_Form SHALL select the Costume Contest category.
2. THE Submission_Form SHALL include the repository URL, the live demo URL, the video URL and the Write_Up.
3. WHEN the form is submitted, THE live demo, video and repository SHALL be publicly reachable from a logged-out browser.

### Requirement 5: Schedule

**User Story:** As the entrant, I want milestones that leave margin before the deadline.

#### Acceptance Criteria

1. THE project SHALL meet these milestones: model gate decided by 9 Nov; live detection with replay by 16 Nov; haunted UI and protocol by 23 Nov; local runtime, landing and Autopsy by 30 Nov; video and write-up final by 3 Dec.
2. WHEN a milestone slips by more than 2 days, THE scope SHALL be cut in this order: Pro engine streaming, Autopsy in the engine, Kiro power, Autopsy in the browser.
