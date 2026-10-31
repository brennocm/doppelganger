# Requirements Document

## Introduction

The landing page at the Pages root is the project's front door for judges and visitors. Its job (Persuade mode) is to make the danger concrete in one screen, get the visitor into the live demo, prove the privacy claim and show how to run it locally. It is static, self-hosted and follows the same CSP as the app, with one exception for the privacy-preserving video embed.

## Glossary

- **Landing**: `apps/landing`, served at `/`.
- **Video_Facade**: a static poster image that loads the YouTube player from `youtube-nocookie.com` only after the visitor clicks it.
- **Proof_Panel**: the section that shows how to verify that no audio leaves the device.

## Requirements

### Requirement 1: Opening screen

**User Story:** As a judge, I want to understand the project and try it within seconds.

#### Acceptance Criteria

1. THE Landing first viewport SHALL contain the project name, a one-sentence description of what it does, the primary action "Try the live demo" linking to `/app/`, and a secondary action "Watch the 3-minute video".
2. THE Landing first viewport SHALL show a real screenshot or looping capture of the app changing from Mask to Possession, with a static alternative under reduced motion.
3. THE Landing SHALL use the design tokens and copy rules from the design-system steering.

### Requirement 2: The scenario

**User Story:** As a visitor, I want to see why this matters, in a situation I recognize.

#### Acceptance Criteria

1. THE Landing SHALL describe one concrete scenario (a cloned executive voice asking for an urgent transfer) as a short three-step sequence: the call, the alert, the protocol.
2. THE Landing SHALL avoid invented statistics; any number cited SHALL link to its public source.

### Requirement 3: Privacy proof

**User Story:** As a skeptical visitor, I want to verify the privacy claim myself.

#### Acceptance Criteria

1. THE Proof_Panel SHALL explain in three short steps how to open the browser's network inspector, start a replay and confirm that no request carries audio.
2. THE Proof_Panel SHALL state what runs where: model and audio in the browser, nothing sent to a server.
3. THE Proof_Panel SHALL link to the security steering and the model card in the repository.

### Requirement 4: Run it yourself

**User Story:** As a SecOps visitor, I want the local options at a glance.

#### Acceptance Criteria

1. THE Landing SHALL present the three tiers (demo, self-hosted, Pro engine) as a comparison table with columns: what you need, what runs where, which model.
2. THE Landing SHALL show the install commands for Linux and WSL2 with a copy button, and SHALL state that macOS is untested.

### Requirement 5: Honest limits

**User Story:** As a judge, I want to know what it can't do.

#### Acceptance Criteria

1. THE Landing SHALL include a "Limits" section summarizing the model card: probabilistic scores, known failure conditions, and that it does not identify people.
2. THE Landing SHALL show the latest evaluation numbers from the model card with their date, or no numbers at all.

### Requirement 6: Built with Kiro

**User Story:** As a judge, I want a quick route to how it was built.

#### Acceptance Criteria

1. THE Landing SHALL include a "How it was built" section linking to the repository's `.kiro/` folder, the write-up and the journal.

### Requirement 7: Video embed and performance

**User Story:** As a visitor, I want a fast page that doesn't track me before I choose to watch.

#### Acceptance Criteria

1. THE Landing SHALL embed the video through the Video_Facade, loading no third-party resources until the visitor clicks.
2. THE Landing CSP SHALL allow `frame-src https://www.youtube-nocookie.com` and nothing else beyond the app's CSP.
3. THE Landing SHALL weigh under 500 KB before the video is loaded, excluding the optional looping capture, which SHALL be under 2 MB and lazy-loaded.
4. THE Landing SHALL be usable from 375 px to 1440 px and pass axe-core checks.
