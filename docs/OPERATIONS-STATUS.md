# Operations status — 13 November 2026

The cloud AI worker and daily private backups are activated on the deployed college release `b920680`. No new paid hosting service was purchased.

## Current cloud activation

- `CLOUD_AI_ENABLED=true` is enabled for the cloud workflow, with a nominal five-minute schedule. Jobs are bounded and schedules may be delayed; no continuous availability or instant inference is promised.
- [Manual cloud inference](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43399004772) processed a private photo suggestion and search using the real pinned models. The search returned 384-dimensional text and 512-dimensional image vectors. Both test jobs reached ready on their first attempt; verification took about 84 seconds including queue/startup. Only the two generated jobs were removed afterward; the source photo was unchanged.
- The workflow is active and its scheduling variable is enabled. No scheduler-triggered AI run was observed during this release check; manual cloud execution is verified. Monitor the first scheduled run rather than interpreting the nominal five-minute interval as a guarantee. The live app returned `intelligence: true` after the cloud heartbeat.
- The legacy Windows task `LostFound-AI-Worker-515272C83715` is **disabled**. Cloud processing and backups run on GitHub without the personal computer remaining awake.
- The [scheduled backup](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43391266889) and [manual restore confirmation](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43398674783) passed with **32 tables and two photos**. The old workflow/schema mismatch is resolved by deploying the matching backup code. `OPERATIONS_ENABLED=true` remains set; target 07:00 India time, subject to schedule delays.
- Push keys are protected in Render and GitHub. Automated transport/queue tests passed; receipt on a real opted-in phone is still unverified.
- See [release evidence and pilot acceptance](COLLEGE-UPGRADE.md). The earlier Windows activation below is historical and does not describe the currently active worker.


## Historical Windows activation — 29 October 2026

- Windows task `LostFound-AI-Worker-515272C83715` starts at the configured user's sign-in, runs without administrator privileges, and uses Windows-encrypted credentials outside Git.
- The installed task allows battery operation. It does not prevent sleep or wake the computer. AI processing pauses when this computer is asleep, off, or signed out; ordinary report matching remains available.
- The live app returned `intelligence: true` after a production database heartbeat. A stop/restart check confirmed the original launcher and both Node children exited, and a new worker resumed polling.
- A temporary private search processed through the actual worker produced 384-dimensional MiniLM text and 512-dimensional CLIP image vectors with the pinned model version. The test search was removed afterward; existing reports and claims were preserved.
- That first live search took approximately 92 seconds including queue wait and model initialization. This establishes working inference, not guaranteed latency or matching accuracy.
- See [the Windows worker guide](LOCAL-WORKER.md) for status, stop, removal, and reinstall commands. Keep the checkout, Node, and the selected PowerShell executable available at their installed paths.

## Original backup activation — 29 October 2026

- The GitHub workflow is active and repository variable `OPERATIONS_ENABLED=true` is set. Its daily target is 01:30 UTC / **07:00 India time**; GitHub may delay execution.
- The first [successful backup and restore run](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/40755202045) restored **22 tables and one photo**. Its encrypted archive is **20,171 bytes** and was independently confirmed in the private `lost-found-backups` bucket.
- Every run verifies the downloaded archive, performs an isolated restore, then applies 14-day retention and bounded maintenance. At least the newest two archives are retained.
- All seven required repository secrets are configured. The backup password is stored in GitHub secret storage and a Windows current-user encrypted recovery file at `.sites-runtime/operations-private/backup-password.dpapi`. Never publish that file or display decrypted values in logs. Windows encryption ties this local copy to the current Windows profile; it is not a portable recovery key.
- Daily backups run on GitHub even while this computer is off. Monitor successful runs and provider capacity. GitHub can disable a public repository's schedule after 60 days without repository activity; [maintenance instructions](MAINTENANCE.md) cover re-enabling it.

Physical Android/iPhone acceptance, signed Android packaging, and a representative real-item accuracy evaluation are separate work and are not claimed complete by this activation.
