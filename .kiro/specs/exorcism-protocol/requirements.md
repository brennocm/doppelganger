# Requirements Document

## Introduction

An alert alone doesn't help someone under pressure on a call. The exorcism protocol turns Possession into a short, concrete checklist of what to do next, and produces an incident summary the user can hand to their security team. The summary contains no audio and leaves the device only if the user copies or downloads it.

## Glossary

- **Protocol**: the ordered checklist shown in Possession.
- **Protocol_Step**: one action in the Protocol, with a title, a one-line instruction and a "Done" control.
- **Code_Word_Reminder**: an optional, user-written hint (not the code word itself) shown in step 2.
- **Incident_Summary**: a plain-text and JSON report of the session, built from `SessionStats`.

## Requirements

### Requirement 1: Protocol steps

**User Story:** As a user who just got a Possession alert, I want clear next steps, so that I don't get pushed into a mistake.

#### Acceptance Criteria

1. WHEN Possession is entered, THE app SHALL show the Protocol with these steps in order:
   1. "Don't approve anything on this call": no payment, transfer, PIX, password or code.
   2. "Ask something only the real person would know": the agreed code word or a shared detail.
   3. "Hang up and call back": use a number you already have, not one given during this call.
   4. "Tell your security team": copy or download the incident summary.
2. THE Protocol SHALL let the user mark each step as done, in any order.
3. WHEN all steps are marked done, THE app SHALL send `protocol-completed` to the detector.
4. THE Protocol SHALL remain reachable from the Main_View and the Widget until the session ends.

### Requirement 2: Code word reminder

**User Story:** As a user, I want a reminder of which code word my team uses, without the app storing a secret.

#### Acceptance Criteria

1. THE settings SHALL let the user save a Code_Word_Reminder of at most 80 characters in local storage.
2. THE settings SHALL explain that the reminder must be a hint and not the code word itself.
3. WHEN a Code_Word_Reminder exists, THE app SHALL show it inside step 2.
4. THE app SHALL let the user delete the reminder at any time.

### Requirement 3: Incident summary

**User Story:** As a user, I want to report the attempt quickly, so that my security team can respond.

#### Acceptance Criteria

1. THE Incident_Summary SHALL include: session start and end time in ISO 8601 with offset, source kind (tab, mic or replay), voiced duration, peak and mean dissonance, time spent in each state, transition timestamps, model ID and version, app version, and the Protocol steps marked done.
2. THE Incident_Summary SHALL NOT include audio, levels, file names, tab titles or URLs.
3. THE app SHALL offer "Copy summary" (plain text) and "Download summary" (JSON).
4. THE plain-text summary SHALL include a one-line note that the score is a probabilistic estimate, not proof.
5. WHEN the session is a replay, THE Incident_Summary SHALL say so in its first line.

### Requirement 4: Never blocking

**User Story:** As a user, I want the protocol to help without getting in the way of the call.

#### Acceptance Criteria

1. THE Protocol SHALL be an in-page panel, not a modal dialog.
2. THE Protocol SHALL be fully keyboard operable and announced to screen readers as a list with done states.
