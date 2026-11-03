# ChatGPT and Grok Joint Build Coordination

Status: SAL-001 in-memory booking reference is on `build/joint-agent-booking-foundation` (PR #6). SAL-002 persistent scheduling is implemented on `build/sal-002-persistent-scheduling` as a draft PR against that foundation branch. Independent G6 QA has not accepted it.

## Shared work queue

Repository: https://github.com/manvik01/SalonOS

- SAL-001 coordinator: https://github.com/manvik01/SalonOS/issues/2
- SAL-002 persistent scheduling and identity: https://github.com/manvik01/SalonOS/issues/3
- SAL-003 responsive booking UI: https://github.com/manvik01/SalonOS/issues/4
- SAL-004 cash checkout and close: https://github.com/manvik01/SalonOS/issues/5

The user chose Grok chats. There is no automatic bridge, API runner or background agent synchronization configured. The founder relays task packets and result links between chats. Never claim another chat received or accepted a task without its actual response. A shared GitHub issue is a durable handoff location, not proof that a Grok chat is monitoring it.

## Active role split

| Work | ChatGPT agents | Grok chat agents |
|---|---|---|
| Requirements/manual | Research, specification and manual ownership | Propose implementation questions and actual UI changes |
| Booking foundation | Initial in-memory reference and tests | Replace with persistent authorized service under SAL-002 |
| Code implementation | May implement explicitly assigned nonconflicting tasks | Own accepted build tasks and return patch/PR evidence |
| Independent validation | Separate reviewing agent; reproduce defects | Separate Grok reviewer may additionally validate; never self-approve |
| Coordination | Publish task contracts and inspect returned evidence during user-invoked sessions | Coordinator routes packets between Grok worker chats |
| Release | Review evidence and update manual | Prepare staging/release pack; founder authorizes production |

No named Grok worker is a confirmed GitHub assignee. Do not assign issues to guessed usernames. Text returned from a Grok chat must be identified as a proposal until it is matched to an actual commit, patch or reproducible execution result.

## Session procedure

1. Read issue, PRD/MVP/TDD versions and current repository/branch head.
2. Acknowledge task/revision, owner role and base SHA in the chat. Founder records or relays the acknowledgement.
3. Implement in a dedicated branch or return a unified patch if the chat lacks repository tools. State that limitation explicitly. One writer per shared contract or migration.
4. Return task ID, base/result commit, files, test commands/raw outputs, migration notes, known limitations and next owner. Missing execution access means tests are NOT RUN.
5. Independent agent checks the exact patch/commit and reports pass/fail with reproducible evidence.
6. Resolve failures before acceptance. Update the manual only for verified behavior. Keep API/database changes synchronized with their consumers.
7. Founder reviews concrete release candidate. No release authorization is inferred from a bot conversation.

## Ready-to-paste Grok coordinator kickoff

Copy the following into a Grok chat. If that chat cannot open repository content, attach the relevant repository files and issue text.

> Act as SalonOS G0 Delivery Coordinator. Coordinate Grok worker chats with the ChatGPT research/build/review team through https://github.com/manvik01/SalonOS. Start from issue #2 and read the PRD, MVP, TDD, agent charter and docs/delivery/COLLABORATION.md. A ChatGPT reference booking implementation will be available in the linked foundation PR; inspect its exact commit and stated limits before using it. Acknowledge which files you actually read and which tools you really have. Do not claim to message ChatGPT or run code unless a tool did so. Route issue #3 to Architect/Booking first, then #4 to UI and #5 to Commerce after stable contracts. Use dedicated branches and return PRs; if repository execution is unavailable, return a unified patch and mark all unrun tests NOT RUN. Keep independent QA/security review separate from the author. Do not merge, deploy, spend money, process real payments or message customers. Return the next task packet and any decisions needed, using actual IDs and commit evidence.

## Work status and next update

The first reference implementation is a single-process in-memory scheduler, not a web app, authentication layer or persistent reservation system. It is a behavioral starting point for SAL-002; database concurrency tests remain required. QA evidence in docs/validation records only the checks actually performed.

The next shared update is independent QA of the SAL-002 draft PR against `build/joint-agent-booking-foundation`. Do not merge to `main` from this slice. No recurring monitoring or scheduled task is configured.
